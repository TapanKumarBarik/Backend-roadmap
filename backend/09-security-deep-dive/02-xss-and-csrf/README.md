# Module 02: XSS and CSRF

## Why this matters

Module 01's injection continues here, but the interpreter changes: instead of
your database, the target is the **browser's HTML/JavaScript parser**.
Cross-site scripting (XSS) is injection into a web page — you render
attacker-controlled text without escaping it, the browser parses it as `<script>`
instead of as text, and now the attacker's JavaScript runs on your origin,
*as your user*. Track 03 already told you why that's an auth catastrophe (a
`localStorage` token exfiltrated in one line, a live session hijacked even
behind `HttpOnly`); this module is where you learn to actually stop it.

CSRF (cross-site request forgery) is the mirror image: it doesn't run code on
your page — it abuses the browser's habit of *automatically attaching your
cookies* to make the victim's browser fire an authenticated request they never
intended. Track 03 introduced both as the "seams" that break otherwise-correct
auth; here you get the full treatment — the three XSS variants, output encoding,
Content-Security-Policy, sanitization for rich text, and the CSRF defenses
(`SameSite`, synchronizer and double-submit tokens) — and, just as important,
where the two threats *trade off* against each other so you defend in layers
instead of swapping one hole for another.

## Concepts

### XSS is injection into the browser — three variants

XSS is the same root cause as SQLi (module 01): untrusted input concatenated
into a command channel — here, the HTML your server (or JS) hands the browser.
If a user's input reaches the page unescaped, `<script>steal()</script>` is
parsed as a real script tag and executes. It comes in three flavors, defined by
*where the untrusted data lives before it hits the page*:

- **Reflected XSS.** The payload rides in the *request* and is echoed straight
  back in the *response*. Classic case: a search page that prints
  `You searched for: <the query>`. A link like
  `yoursite.com/search?q=<script>...</script>` sent to a victim runs the script
  in *their* session when they click it. Non-persistent — it only fires for
  whoever opens the crafted link.
- **Stored (persistent) XSS.** The payload is *saved* (a comment, a profile bio,
  a product review, a support ticket) and served to *everyone* who views it
  later. Far more dangerous — one poisoned comment hits every visitor, including
  admins, with no crafted link needed. This is why "data read back out of your
  own DB is still untrusted" (module 00) matters: the DB faithfully stored the
  attack.
- **DOM-based XSS.** The injection never touches the server response — it happens
  *entirely in the browser*, when client-side JavaScript takes attacker-
  controlled input (`location.hash`, a query param, `postMessage`) and writes it
  into the DOM with a dangerous sink (`innerHTML`, `document.write`,
  `eval`). Your server-side escaping can't help here because the server never
  sees the sink; the fix lives in the frontend.

Whatever the variant, the impact is identical: script running on your origin can
read the DOM, make authenticated requests as the user, exfiltrate anything JS
can reach, and rewrite the page (fake login prompts).

### The fix: context-aware output encoding

The root fix for reflected and stored XSS is **output encoding (escaping)** at
the moment untrusted data is written into the page: convert HTML-significant
characters to their entities so the browser renders them as *text*, not markup.
`<` becomes `&lt;`, `>` becomes `&gt;`, `&` becomes `&amp;`, `"` becomes
`&quot;` — so `<script>` is displayed literally instead of executed.

The critical word is **context-aware**. The correct encoding depends on *where
in the page* the data lands, and they are not interchangeable:

- **HTML body** (between tags): HTML-entity-encode.
- **HTML attribute** (`value="..."`): attribute-encode and always quote the
  attribute.
- **Inside a `<script>` block / JS string**: JavaScript-encode (or better,
  don't — pass data via `data-` attributes or JSON in a way the JS reads
  safely).
- **In a URL** (`href`, `src`): URL-encode, and validate the scheme (block
  `javascript:` URLs).

In practice you rarely hand-encode: **modern template engines auto-escape by
default.** Jinja2 (used by FastAPI/Flask via `Jinja2Templates`) HTML-escapes
every `{{ variable }}` unless you explicitly opt out. The danger is opting out:

```python
# Jinja2 auto-escapes {{ comment }} → a <script> in it renders as harmless text.
# The vulnerability is when someone disables that:
#   {{ comment | safe }}        ← "safe" means "I promise this is trusted" — it isn't
#   {% autoescape false %}      ← turns escaping off for a block
# Or building HTML by hand in Python and returning HTMLResponse:
return HTMLResponse(f"<p>You searched for: {q}</p>")   # VULNERABLE — no escaping
```

FastAPI's default JSON responses are *not* an XSS vector on their own (a JSON
API returns `application/json`, which the browser doesn't parse as HTML) — XSS
is a concern wherever your server or frontend renders data *into HTML*. If your
backend is a pure JSON API and a separate frontend renders it, the escaping duty
moves to that frontend (React/Vue auto-escape `{value}`; the danger there is
`dangerouslySetInnerHTML`/`v-html`).

### Sanitization — when you must allow *some* HTML

Escaping turns all HTML into text — perfect when the user should never send
markup. But sometimes you *want* to let users submit rich text (a comment with
`<b>bold</b>` and links). You can't escape it (that defeats the feature) and you
can't trust it (that's XSS). The answer is **sanitization**: parse the HTML and
keep only an *allowlist* of safe tags/attributes, stripping everything else
(`<script>`, `onerror=`, `javascript:` URLs, `<iframe>`).

Do this with a dedicated, maintained library — **never a regex.** In Python,
`nh3` (Rust `ammonia` bindings) or `bleach` (now deprecated but illustrative):

```python
import nh3
dirty = '<p onclick="steal()">Hi <script>alert(1)</script></p><a href="javascript:evil()">x</a>'
clean = nh3.clean(dirty)     # allowlist-based: keeps <p>/<a>, drops onclick, <script>, javascript:
# → '<p>Hi </p><a rel="noopener noreferrer">x</a>'
```

The rule: **escape by default; sanitize only where rich text is a real
requirement, and only with an allowlist library.** Blocklisting "dangerous"
patterns with regex is the same losing game as in module 01 — attackers have
endless encodings and tag tricks (`<img src=x onerror=...>`, `<svg onload=...>`,
`java\tscript:`) to evade it.

### Content-Security-Policy — the defense-in-depth backstop

Even with escaping, mistakes happen. **Content-Security-Policy (CSP)** is an
HTTP response header that tells the browser *which sources of script/style/etc.
are allowed to run*, so that even if an injection lands, the browser refuses to
execute it. It's the classic defense-in-depth layer for XSS — not a substitute
for escaping, a backstop behind it.

```
Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'
```

- `script-src 'self'` — only scripts from your own origin run; an injected inline
  `<script>` or a `src=evil.com` won't execute.
- The big win is **blocking inline scripts** (`<script>alert(1)</script>` and
  `onclick=` handlers) — which is exactly what most reflected/stored XSS payloads
  are. This is why `'unsafe-inline'` in `script-src` guts the protection; avoid
  it (use nonces/hashes if you need specific inline scripts).
- `object-src 'none'`, `frame-ancestors 'none'` (anti-clickjacking, ~
  `X-Frame-Options`, module 06) round it out.

CSP is fiddly to roll out (start in `Content-Security-Policy-Report-Only` mode to
see what would break), and it's covered again as a header in module 06. The
point here: it's the safety net *under* output encoding, not instead of it.

### CSRF — abusing the browser's automatic cookie attachment

CSRF is the opposite shape from XSS: it runs *no* code on your page. It exploits
the fact that browsers **automatically attach your cookies to every request to
an origin**, including requests initiated by a *different* site. So a malicious
page can make the victim's browser fire an authenticated, state-changing request
to your app:

```html
<!-- On evil.com. The victim is logged into bank.com in another tab. -->
<form action="https://bank.com/transfer" method="POST">
  <input name="to" value="attacker"><input name="amount" value="10000">
</form>
<script>document.forms[0].submit()</script>   <!-- auto-fires on page load -->
```

The browser POSTs to `bank.com` and *attaches the victim's bank.com session
cookie automatically* — the server sees a valid session and executes the
transfer. The victim authorized nothing. Key properties: CSRF needs a
**state-changing** request (GET endpoints must never change state — that's
partly why), and it targets **cookie/session auth specifically**, because that's
what the browser attaches automatically. Bearer-token APIs (module 02 of track
03), where the client must *explicitly* set `Authorization`, are largely immune
— an attacker's page can't read or set your token — which is a real point in
favor of bearer tokens for SPAs. (But then you owe XSS extra vigilance; see the
tradeoff below.)

### CSRF defenses — SameSite, and anti-CSRF tokens

Use more than one:

- **`SameSite` cookie attribute** (track 03, module 01). `SameSite=Lax` (a
  modern browser default) stops the cookie from being attached on cross-site
  *subrequests* like the forged POST above, while still allowing it on top-level
  navigations. `SameSite=Strict` is stricter (not sent even on top-level cross-
  site navigation — can log users "out" when arriving from a link). This is the
  cheap, powerful first line — but don't rely on it *alone* (older browsers,
  edge cases, and `Lax` still permits some GET navigations).
- **Synchronizer token pattern (the robust standard for cookie apps).** The
  server generates an unpredictable per-session **CSRF token**, embeds it in the
  page/form, and requires it echoed back (in a header like `X-CSRF-Token` or a
  form field) on every state-changing request. The attacker's site *cannot read
  the token* (same-origin policy blocks it from reading your pages), so it can't
  forge a valid request. Requires server-side state per session.
- **Double-submit cookie (stateless variant).** Send the CSRF token both as a
  (JS-readable) cookie *and* require it echoed in a header; the server checks the
  two match. No server state needed, but weaker (relies on the attacker not
  being able to set your cookie; combine with `SameSite`).

```python
# Synchronizer token, sketched — issue per session, verify on state change.
import secrets
def issue_csrf(session) -> str:
    session["csrf"] = secrets.token_urlsafe(32); return session["csrf"]

def require_csrf(request, session):
    sent = request.headers.get("X-CSRF-Token")
    if not sent or not secrets.compare_digest(sent, session.get("csrf", "")):
        raise HTTPException(403, "CSRF token invalid")   # constant-time compare (track 03 m07)
```

### The XSS/CSRF tradeoff — defend in layers, not by swapping holes

The two threats pull in opposite directions, and internalizing this keeps you
from "fixing" one by opening the other:

- **Cookie/session auth** is the CSRF target (auto-attached) but resists XSS
  *token theft* when `HttpOnly` (script can't read the cookie). Defend with
  `SameSite` + CSRF tokens; XSS can still *ride* the session but not steal it.
- **Bearer tokens** (in JS-reachable storage) dodge CSRF (not auto-attached) but
  are the prime XSS *exfiltration* target — one injected line steals them.
  Defend with escaping + CSP, and prefer not to store them where JS can read.

There is **no single storage/auth choice that's safe against everything.** You
pick a model, then layer the defenses that model needs: `HttpOnly` +
`SameSite` + CSRF tokens + escaping + CSP together, not one of them as a silver
bullet.

## Command reference

| Pattern | Purpose | Snippet |
|---|---|---|
| Jinja2 auto-escape (default) | stop XSS in server-rendered HTML | `{{ user_input }}` (leave `\| safe` off) |
| `nh3.clean(html)` | sanitize allowed rich text | allowlist tags/attrs, strip scripts |
| `HTMLResponse` with f-string | **anti-pattern** — unescaped | avoid; render via a template instead |
| CSP header | backstop: block injected/inline script | `default-src 'self'; script-src 'self'` |
| `X-Content-Type-Options: nosniff` | stop MIME-sniff XSS (module 06) | on every response |
| `SameSite=Lax/Strict` cookie | first-line CSRF defense (track 03 m01) | `set_cookie(..., samesite="lax")` |
| synchronizer CSRF token | robust CSRF defense for cookie apps | per-session, `X-CSRF-Token`, compared constant-time |
| `secrets.compare_digest` | constant-time token compare (track 03 m07) | never `==` on the CSRF token |

A FastAPI middleware applying CSP + serving an escaped template + enforcing CSRF:

```python
from fastapi import FastAPI, Request, HTTPException
from fastapi.templating import Jinja2Templates
from starlette.middleware.base import BaseHTTPMiddleware
import secrets

app = FastAPI()
templates = Jinja2Templates(directory="templates")   # auto-escapes {{ }}

class SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        resp = await call_next(request)
        resp.headers["Content-Security-Policy"] = "default-src 'self'; object-src 'none'; frame-ancestors 'none'"
        resp.headers["X-Content-Type-Options"] = "nosniff"
        return resp
app.add_middleware(SecurityHeaders)

@app.post("/comment")
async def add_comment(request: Request):
    # CSRF: state-changing + cookie-authed → require the synchronizer token
    if not secrets.compare_digest(request.headers.get("X-CSRF-Token", ""),
                                  request.session.get("csrf", "x")):
        raise HTTPException(403, "CSRF token invalid")
    # ... store comment; it will be auto-escaped when rendered in a Jinja2 template ...
```

## Hands-on exercises

Continue in `sec-track`. You'll want a couple of HTML-rendering endpoints (use
`Jinja2Templates`) and a second origin for the CSRF attack (a static
`evil.html` served from a different port with `python -m http.server`).

### 1. Reflected XSS, then escape it

Build a `/search` that returns `HTMLResponse(f"<p>Results for: {q}</p>")`. Visit
`?q=<script>alert(document.domain)</script>`. Expected: the alert fires — you've
reflected script into your page. Now render `q` through a Jinja2 template
(`{{ q }}`) instead and replay. Expected: the payload shows as literal text; the
script no longer runs.

### 2. Stored XSS — the dangerous one

Add a comments feature: `POST /comment` saves the body, `GET /comments` renders
all of them. Post `<script>document.title='pwned'</script>` as a comment, then
load the page as a *different* user. Expected: the script runs for every viewer
— demonstrating why stored XSS hits everyone, not just a link-clicker. Then fix
it via template auto-escaping and confirm all viewers now see harmless text.

### 3. Feel why `| safe` is a footgun

Take your fixed comment template and add `| safe` to the variable
(`{{ comment | safe }}`). Reload with the stored payload. Expected: XSS is back —
proving that `| safe` / `autoescape false` is exactly the switch that reopens
the hole, and should only ever wrap content *you* generated.

### 4. Sanitize rich text instead of escaping it

Requirement change: comments may contain `<b>`, `<i>`, and links. You can't fully
escape (kills the feature) and can't trust it. Run each comment through
`nh3.clean()` before storing/rendering and post a payload mixing allowed tags
with `<script>`, `onerror=`, and a `javascript:` link. Expected: bold/italic/
links survive; the script, event handler, and `javascript:` URL are stripped.

### 5. Add a Content-Security-Policy and watch it block a leak

Add the CSP middleware (`script-src 'self'`). Temporarily re-introduce a stored
XSS (remove escaping) and reload. Expected: the browser console reports a CSP
violation and the injected inline script is *blocked from executing* even though
it's in the DOM — you've seen defense-in-depth catch a failure of the primary
control. Then note what happens if you add `'unsafe-inline'` (protection gone).

### 6. DOM-based XSS — the server never sees it

Add a page with client JS that does
`document.getElementById('out').innerHTML = location.hash.slice(1)`. Visit
`page#<img src=x onerror=alert(1)>`. Expected: it fires, and your server logs
show the payload *never reached the server* (it's after the `#`) — so server-side
escaping is irrelevant. Fix it by using `textContent` instead of `innerHTML`.

### 7. Perform a CSRF attack against your own app

Ensure a state-changing cookie-authed endpoint exists (e.g. `POST
/change-email`). Log in via the browser. From a *different origin* serve an
`evil.html` with an auto-submitting form targeting that endpoint. Load it.
Expected: the email changes — your session cookie was attached automatically,
no token needed. This is CSRF, reproduced.

### 8. Block the CSRF three ways

Defend the endpoint from exercise 7: (a) set `SameSite=Lax` on the session
cookie and replay the attack; (b) add a synchronizer CSRF token
(`X-CSRF-Token`, compared with `compare_digest`) and replay; (c) confirm a
legitimate same-origin request still works with the token. Expected: `SameSite`
alone stops the forged POST, and the token stops it independently — defense in
depth, either layer sufficient here but both kept.

### 9. Diagnose and fix: the profile page

Audit this feature (a JSON API storing a bio, plus a server-rendered profile
page) for XSS and CSRF and fix everything.

```python
@app.post("/api/profile")                       # cookie-session authed
async def save_profile(request: Request):
    data = await request.json()
    db.save_bio(current_user(request), data["bio"])      # stored verbatim
    return {"ok": True}

@app.get("/u/{name}", response_class=HTMLResponse)
def profile_page(name: str):
    bio = db.get_bio(name)
    return f"<h1>{name}</h1><div class='bio'>{bio}</div>"   # hand-built HTML
```

<details>
<summary>Solution</summary>

Flaws: (1) **Stored XSS** — `bio` (and `name`) are concatenated into HTML with
no escaping, and the bio was stored verbatim, so `<script>` in a bio runs for
every visitor. Fix: render via a Jinja2 template (`{{ name }}`, `{{ bio }}`) so
both auto-escape; if the bio must allow rich text, `nh3.clean()` it (allowlist)
on the way in/out instead. (2) **No CSP** — add `script-src 'self'` as a backstop
so a future escaping slip doesn't execute. (3) **CSRF on `POST /api/profile`** —
it's cookie-session authed and state-changing but has no CSRF protection, so
`evil.com` can force a bio change; add `SameSite=Lax` on the session cookie *and*
a synchronizer token (`X-CSRF-Token`, `compare_digest`). (Note: if this API were
bearer-token authed it'd be CSRF-immune but you'd owe XSS extra care — the
tradeoff.) Corrected shape: escape/sanitize on output, CSP header, `SameSite` +
CSRF token on the state-changing route.

</details>

## Independent challenge

No code given. Build a small "public guestbook" for `sec-track`: any logged-in
user can post a message (rich text allowed — bold, italics, links), and all
messages render on a public page seen by everyone. Make it **XSS-safe** (decide
per field: escape the plain fields, *sanitize* the rich-text field with an
allowlist library, and add a CSP backstop) and **CSRF-safe** on the posting
endpoint (`SameSite` + a synchronizer token, compared in constant time — reach
back to **track 03 module 07**'s constant-time comparison, and **module 01** of
this track's "validation ≠ the fix" reasoning applied to why you sanitize rather
than blocklist). Then write a short note: classify the guestbook's XSS risk as
reflected/stored/DOM and justify it, and explain the XSS↔CSRF tradeoff for your
chosen auth model — which attack each credential type is *more* exposed to and
why you still need both sets of defenses.

<details>
<summary>Hint</summary>

The design decision that carries this challenge is **escape vs sanitize, per
field**: a username or title should be *escaped* (the user has no business
sending markup, so turn it all to text), but the rich-text body must be
*sanitized* (parsed, allowlisted down to `<b>/<i>/<a>`, everything else
stripped) because escaping would destroy the feature and trusting it is XSS. Use
a maintained allowlist sanitizer (`nh3`), never a regex blocklist — same lesson
as module 01: content filtering by pattern is bypassable, structural/allowlist
handling is not. The guestbook is **stored** XSS (messages are persisted and
served to everyone), which is the worst kind because one payload hits every
visitor including admins — so the CSP backstop and the sanitizer both earn their
place as independent layers.

</details>

## Common mistakes & troubleshooting

- **Building HTML by hand / `HTMLResponse(f"...{user}...")`.** No escaping =
  XSS. Render through an auto-escaping template engine (Jinja2) instead.
- **Using `| safe` / `autoescape false` / `dangerouslySetInnerHTML` on
  untrusted data.** That switch *is* the vulnerability. Only ever wrap content
  you generated yourself.
- **Sanitizing with a regex/blocklist.** Endless bypasses
  (`<svg onload>`, encodings). Use an allowlist sanitizer library (`nh3`).
- **Escaping when you should sanitize (or vice versa).** Escape when no markup is
  allowed; sanitize (allowlist) only where rich text is a real requirement.
- **Treating CSP as a replacement for escaping.** CSP is a backstop; escaping is
  the fix. And `'unsafe-inline'` in `script-src` defeats most of CSP's XSS value.
- **Forgetting DOM XSS.** Server-side escaping can't help when client JS writes
  untrusted input into `innerHTML`. Use `textContent`/safe sinks in the frontend.
- **Relying on `SameSite` alone for CSRF.** Good first line; add a synchronizer
  token for state-changing cookie-authed requests (older browsers, `Lax` GET
  gaps).
- **A state-changing GET endpoint.** CSRF-friendly and cache/log-leaky. Mutations
  are POST/PUT/DELETE, and still need CSRF protection.
- **Comparing the CSRF token with `==`.** Timing side-channel (track 03 m07). Use
  `secrets.compare_digest`.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Define reflected, stored, and DOM-based XSS by *where the payload lives*, and
   say which is usually most dangerous and why.
2. What is context-aware output encoding, and why can't you use one escaping
   function everywhere?
3. When do you *sanitize* HTML instead of *escaping* it, and why must you use an
   allowlist library rather than a regex?
4. What does a Content-Security-Policy do for XSS, why is it not a replacement
   for escaping, and what does `'unsafe-inline'` do to it?
5. Explain the CSRF mechanism and why it threatens cookie/session auth but
   largely spares bearer-token APIs.
6. Name three CSRF defenses and how each stops the forged request.
7. State the XSS↔CSRF tradeoff between cookie-session and bearer-token auth.

<details>
<summary>Answers</summary>

1. **Reflected** — payload is in the request and echoed into the immediate
   response (crafted link, fires per victim). **Stored** — payload is persisted
   (comment/bio) and served to everyone who views it later. **DOM** — injection
   happens in client JS writing untrusted input into a dangerous sink; the
   server never sees it. Stored is usually worst: one payload hits every viewer,
   including admins, with no crafted link.
2. Encoding untrusted data for the *specific context* it lands in (HTML body,
   attribute, JS string, URL), because each context has different significant
   characters and escaping rules — HTML-entity encoding doesn't neutralize a
   `javascript:` URL or a JS-string breakout, so the wrong encoder leaves a
   hole. Auto-escaping template engines handle the common HTML-body case.
3. Sanitize when the feature *requires* allowing some HTML (rich text); escaping
   would destroy the markup and trusting it is XSS. Use an allowlist library
   (`nh3`) that keeps only known-safe tags/attrs — a regex blocklist is
   bypassable (`<svg onload>`, encodings), same losing game as module 01.
4. CSP tells the browser which script sources may execute, so an injected inline
   or off-origin script is blocked even if escaping failed — a defense-in-depth
   backstop, not the fix (escaping is). `'unsafe-inline'` re-permits inline
   scripts/handlers, which is what most XSS payloads are, gutting the protection.
5. A malicious page makes the victim's browser send a state-changing request to
   your origin; the browser auto-attaches the session cookie, so the server sees
   a valid session and acts. Bearer-token APIs require the client to explicitly
   set `Authorization`, which a cross-site page can't do, so they're largely
   immune.
6. **`SameSite=Lax/Strict`** — browser won't attach the cookie on cross-site
   subrequests. **Synchronizer token** — unpredictable per-session token echoed
   in a header; the attacker's site can't read it (same-origin policy), so can't
   forge it. **Double-submit cookie** — token sent as both cookie and header,
   server checks they match (stateless, weaker, pair with `SameSite`).
7. Cookie-session auth is the CSRF target (auto-attached) but resists XSS token
   theft when `HttpOnly`; bearer tokens dodge CSRF (not auto-attached) but are
   the XSS exfiltration target if stored where JS can read them. No single
   choice is safe against both — layer `HttpOnly`+`SameSite`+CSRF tokens+
   escaping+CSP.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-02 while attempting these.

1. State module 00's single unifying model of the Top 10, then place SQL
   injection (module 01), stored XSS (module 02), and CSRF (module 02) on it:
   for each, name the trust boundary crossed and the interpreter/mechanism
   abused.
2. Both SQLi and XSS are "injection." Explain what they share (root cause) and
   how their *fixes* differ, and why the difference exists.
3. A teammate says "we validate and strip dangerous characters from all input,
   so we're safe from SQLi and XSS." Give the specific reason this is
   insufficient for *each*, and state the correct primary fix for each.
4. For a cookie-session browser app, you must stop both XSS session-theft and
   CSRF. List the specific controls for each and explain why `HttpOnly` helps one
   but does nothing for the other.
5. Rank *these three* by blast radius and justify: a reflected XSS on a search
   page, a stored XSS in the admin-visible comments feed, and a SQL injection in
   a `/search?q=` that runs as a least-privilege read-only DB user.
6. "We switched from cookies to bearer tokens, so we don't need CSRF protection
   anymore — are we more secure overall?" Answer with the tradeoff and one new
   obligation the switch creates.
7. Apply module 00's "frontend is not a control" principle to module 01 and
   module 02: give one concrete way each vulnerability is reachable even though
   the UI never offers the malicious input.

<details>
<summary>Answers</summary>

1. Model: **untrusted input crossing a trust boundary into an interpreter that
   treats it as more than data.** SQLi: request input crosses into the SQL
   interpreter, parsed as query structure/code. Stored XSS: input crosses in
   (stored), then out into the browser's HTML parser, parsed as markup/script.
   CSRF: the boundary is the *browser's auto-cookie-attachment* — a cross-site
   request crosses into your app carrying the victim's session, abusing the
   browser's ambient authority (not code injection, but the same "trusting
   something you shouldn't" theme).
2. Shared root cause: untrusted data concatenated onto a command channel so the
   interpreter parses it as code. Fixes differ because the interpreters differ:
   SQLi → **parameterize** (send code and data on separate channels to the DB
   driver); XSS → **output-encode/escape** for the browser's HTML context (or
   sanitize for rich text). You can't "parameterize" HTML the way you do SQL,
   and you can't "escape" your way to safe SQL structure — the neutralization is
   context-specific.
3. SQLi: character blocklists are bypassable (encodings, alternate syntax) and
   break real data (O'Brien); primary fix is **parameterized queries** (+ allow-
   list identifiers). XSS: same bypass problem plus you often *need* some markup;
   primary fix is **context-aware output encoding** (+ allowlist sanitization for
   rich text, CSP backstop). Validation is defense in depth, not the fix, for
   both.
4. XSS theft: `HttpOnly` cookie (JS can't read it) + output escaping + CSP.
   CSRF: `SameSite` cookie + synchronizer CSRF token. `HttpOnly` stops script
   from *reading/stealing* the cookie (XSS) but does nothing for CSRF, because
   CSRF never reads the cookie — the browser *attaches it automatically* on the
   forged request regardless of `HttpOnly`.
5. Stored XSS in an admin-visible feed is worst — it runs script in an admin's
   authenticated session (privilege escalation) and hits every viewer. SQLi even
   on a read-only least-privilege user is next — it can still read arbitrary
   readable data (exfiltration) but can't `DROP`/write (blast radius capped by
   least privilege). Reflected XSS on search is narrowest — fires only for a
   victim tricked into opening a crafted link.
6. You *are* largely CSRF-immune now (bearer tokens aren't auto-attached), so
   that specific risk drops — but the new obligation is **XSS discipline**: a
   bearer token in JS-reachable storage is exfiltrated by one injected line, so
   you now owe strict output encoding, CSP, and ideally not storing the token
   where JS can read it. Net security depends on how well you meet that
   obligation — it's a tradeoff, not a free win.
7. SQLi: the UI's search box may cap length or restrict characters, but an
   attacker `curl`s `/search?q=' OR '1'='1` directly — the constraint was only
   client-side. XSS/CSRF: the comment form may sanitize in JS before submit, but
   an attacker POSTs the raw `<script>` payload straight to the API; and a CSRF
   attack never uses your UI at all — it's a form on `evil.com`. All controls
   must be server-side.

</details>

## Next

[03-ssrf-and-deserialization-attacks](../03-ssrf-and-deserialization-attacks/README.md)
— two attacks that turn *your own server's trust* against you: SSRF (you fetch a
URL the attacker chose, reaching internal services and cloud metadata) and
insecure deserialization (you rebuild objects from untrusted bytes — Python's
`pickle` being a direct path to remote code execution).
