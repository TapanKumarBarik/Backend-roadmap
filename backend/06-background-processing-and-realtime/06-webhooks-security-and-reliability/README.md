# Module 06: Webhooks Security and Reliability

## Why this matters

Receiving a webhook means exposing a public HTTP endpoint that performs
*actions* based on what someone POSTs to it — mark an order paid, provision an
account, credit a balance. That's a dangerous thing to leave lying around
unauthenticated. The URL isn't secret (it travels through logs, browser
history, the sender's dashboard), so anyone who learns it can POST a forged
`payment.succeeded` and, if you trust the body, get free stuff. This is not
theoretical: unverified webhook endpoints are a well-worn path to fraud.

The receiving side also inherits every reliability problem from the sender
side, now pointed at *you*. The sender retries, so you *will* receive the same
event more than once — process it naively and you ship the order twice.
Senders expect a fast `2xx`, so if you do the heavy processing inline and take
too long, they time out and retry, amplifying load and duplicates. And you
need to debug all of this against events that only originate from a third
party's servers, which won't POST to `localhost`.

This module is the security-critical half of webhooks. You'll verify
signatures with HMAC the way Stripe and GitHub actually do it, enforce a
replay window, adopt the ack-fast-process-later pattern, make your receiver
idempotent by deduping on event ID, and test the whole thing locally with a
tunnel. Getting this right is the line between a webhook endpoint and a
liability.

## Concepts

### Signature verification with HMAC

The core problem: how do you know a webhook POST *actually* came from the
claimed sender and wasn't forged or tampered with, given that the URL is
effectively public? The answer is a **shared secret** and an **HMAC
signature**.

When a consumer registers an endpoint, the sender gives them a **signing
secret** (a random string) — known only to the two parties. For every webhook,
the sender computes `HMAC-SHA256(secret, payload_bytes)` and puts the
resulting hex digest in a header (Stripe uses `Stripe-Signature`, GitHub uses
`X-Hub-Signature-256`). You, the receiver, recompute the same HMAC over the
*exact raw bytes you received* using your copy of the secret, and compare. If
they match, the message came from someone who holds the secret (the real
sender) and hasn't been altered in transit. An attacker who doesn't know the
secret can't produce a valid signature for their forged body.

```
  SENDER (holds secret)                 RECEIVER (holds same secret)
  payload bytes ─┐                      raw bytes received ─┐
   secret ───────┼─► HMAC-SHA256 ─► sig  secret ────────────┼─► HMAC-SHA256 ─► expected
                 │        │                                 │
                 └── POST body + header ──────────────────► compare_digest(sig, expected)
                          (X-Signature)                        match  ─► trust, process
                                                               differ ─► 401, reject
  Attacker can POST the public URL but, lacking the secret, can't forge `sig`.
```

Two details that are easy to get catastrophically wrong:

1. **Sign the raw bytes, not the parsed-and-reserialized JSON.** If you
   `await request.json()` and then re-`json.dumps()` it to verify, any
   difference in key order, whitespace, or unicode escaping changes the bytes
   and breaks verification — or worse, tempts you to "normalize," opening a
   gap. Verify against `await request.body()` — the exact bytes.

2. **Compare in constant time.** Use `hmac.compare_digest`, not `==`. A naive
   string comparison can leak, through timing, how many leading characters
   matched, enabling a byte-by-byte forgery of the signature. Constant-time
   comparison closes that side channel.

```python
import hmac, hashlib

def verify(secret: bytes, raw_body: bytes, provided_sig: str) -> bool:
    expected = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, provided_sig)   # constant-time
```

### Timestamps and the replay attack

A valid signature proves authenticity, but not *freshness*. An attacker who
captures one legitimately-signed request (from logs, a proxy, a leak) can
**replay** it — POST the identical bytes and signature again later — and it
verifies perfectly, because it's genuinely the sender's signed message. If
that event credits an account, replaying it credits again.

The defense, used by Stripe: include a **timestamp** in the signed data and
sign `timestamp.payload` together. The receiver checks that the timestamp is
within a small tolerance of now (say, five minutes) and rejects anything
older. A captured request is only replayable for that short window, and
combined with idempotency (below) even a within-window replay is a no-op.

```python
# Stripe-style: header carries t=<ts>,v1=<sig>; sender signs f"{t}.{body}"
def verify_signed_ts(secret, raw_body, header, tolerance=300):
    parts = dict(p.split("=", 1) for p in header.split(","))
    t, sig = parts["t"], parts["v1"]
    if abs(time.time() - int(t)) > tolerance:
        return False                       # too old (or clock-skewed) -> reject
    signed = f"{t}.".encode() + raw_body
    expected = hmac.new(secret, signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)
```

### HTTPS is non-negotiable

The secret protects the payload's integrity/authenticity, but the request
still travels the network. Serve your webhook endpoint over **HTTPS** so the
payload (which often contains sensitive data) and headers aren't readable or
modifiable in transit. Reject plain HTTP. This is table stakes and cheap; do
it.

### Acknowledge fast, process later

Senders treat a slow response as a failure and retry. So the receiver's job on
the request is: **verify the signature, persist the event, return `2xx` — and
do nothing slow.** The actual work (updating your database, calling other
services, sending mail) happens in a background task you enqueue. This is the
same "don't do slow work in the request-response cycle" principle from module
00, now with a hard external deadline attached: if you provision the account
*inline* and it takes 12 seconds, the sender times out at 10, marks the
delivery failed, and retries — so now you're provisioning twice under load.

```
POST /webhook  ->  verify sig + freshness  ->  store raw event  ->  enqueue task  ->  return 200
                                                                          |
                                                          worker processes it later
```

The subtlety: return `2xx` *only* once you've durably persisted the event (so
you won't lose it if the worker or process dies), but *before* you process it.
"Received and safely stored" is what a `2xx` should mean to the sender —
not "fully processed."

### Idempotent receivers: dedupe by event ID

Because senders retry (and replays can slip inside the freshness window), you
**will** receive the same event ID more than once. An idempotent receiver
processes each event ID's *effect* exactly once. The mechanism: before
processing, atomically record the event ID (a unique constraint / `SET evt:{id}
NX`), and if it's already present, acknowledge with `2xx` and skip — you've
already handled it.

```python
def already_processed(event_id) -> bool:
    # returns True if we've seen this id before (atomic check-and-set)
    return not redis.set(f"evt:{event_id}", "1", nx=True, ex=86400)
```

Note the interplay: you still return `2xx` for a duplicate (so the sender
stops retrying), you just don't re-do the work. Silently 500-ing on a
duplicate would make the sender retry forever.

### Retry logic on the sender side (and what the receiver owes it)

You met sender-side retries in module 05; as a receiver you must cooperate
with them:

- Return `2xx` for success **and** for already-processed duplicates.
- Return `5xx` (or non-2xx) only when you genuinely couldn't accept the event
  and *want* a retry — e.g. your datastore is briefly down. The sender will
  back off and retry, which is what you want.
- Return `4xx` for a bad/forged/unverifiable request you never want retried
  (bad signature → `401`/`400`). A `4xx` tells a well-behaved sender "don't
  bother retrying; this will never work."

Choosing the right status code is how the receiver steers the sender's retry
behavior.

### Logging and testing webhooks locally

Webhooks originate from a third party's servers, which can't reach
`localhost`. To develop and debug, use a **tunnel** — `ngrok`, `cloudflared`,
or similar — that gives you a public HTTPS URL forwarding to your local port.
Register that URL with the sender, and real webhooks flow to your laptop.
Log every received event (id, type, signature-valid, raw body) so you can
diagnose failures and replay. Most webhook providers also offer a dashboard to
inspect and manually resend deliveries, and a CLI (e.g. `stripe listen`) that
forwards events to your local endpoint without a tunnel.

## Command reference

| Concern | Approach |
|---|---|
| Read raw bytes | `raw = await request.body()` (never re-serialize before verifying) |
| Compute HMAC | `hmac.new(secret, raw, hashlib.sha256).hexdigest()` |
| Constant-time compare | `hmac.compare_digest(expected, provided)` |
| Replay defense | sign `timestamp.body`; reject if `|now - t| > tolerance` |
| Transport security | HTTPS only; reject plain HTTP |
| Ack fast | verify + persist + enqueue + return `2xx`; process in a task |
| Dedupe | atomic `SET evt:{id} NX` / unique constraint before processing |
| Steer retries | `2xx` success+dup, `5xx` retry-me, `4xx` never-retry |
| Local testing | `ngrok http 8000` / `stripe listen --forward-to` |

A secure, reliable receiver in FastAPI — `receiver.py`:

```python
import time, hmac, hashlib, os
from fastapi import FastAPI, Request, HTTPException
import redis

app = FastAPI()
SECRET = os.environ["WEBHOOK_SECRET"].encode()
r = redis.Redis()

def verify(raw_body: bytes, header: str, tolerance: int = 300) -> bool:
    try:
        parts = dict(p.split("=", 1) for p in header.split(","))
        t, sig = parts["t"], parts["v1"]
    except (ValueError, KeyError):
        return False
    if abs(time.time() - int(t)) > tolerance:      # freshness -> anti-replay
        return False
    signed = f"{t}.".encode() + raw_body           # sign timestamp + raw body
    expected = hmac.new(SECRET, signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)      # constant-time

@app.post("/webhook")
async def webhook(request: Request):
    raw = await request.body()                     # EXACT bytes, not reparsed
    sig_header = request.headers.get("X-Signature", "")
    if not verify(raw, sig_header):
        # forged/tampered/stale: 401, and 4xx tells the sender not to retry
        raise HTTPException(status_code=401, detail="invalid signature")

    event = json.loads(raw)
    event_id = event["id"]

    # Idempotency: record the id atomically; if seen, ack and skip.
    is_new = r.set(f"evt:{event_id}", "1", nx=True, ex=86400)
    if not is_new:
        return {"status": "duplicate ignored"}     # 2xx so sender stops retrying

    persist_raw_event(event_id, raw)               # durable BEFORE we ack
    process_event.delay(event_id)                  # slow work happens on a worker
    return {"status": "accepted"}                  # fast 2xx: received + stored

# --- the worker side (Celery) ---
@celery.task(autoretry_for=(TransientError,), max_retries=5, retry_backoff=True)
def process_event(event_id):
    event = load_raw_event(event_id)
    # the real work: update DB, call services, etc. Idempotent per event_id.
    handle(event)
```

## Hands-on exercises

Continue in `bg-queues`. You'll run the receiver and a small "sender" script
that signs requests. `pip install redis requests`. Set `WEBHOOK_SECRET` in
both.

### 1. Verify a good signature, reject a bad one

Write a sender that signs `f"{t}.{body}"` with the shared secret and POSTs to
`/webhook` with an `X-Signature: t=...,v1=...` header. Send one correctly
signed and one with a tampered body (change a byte after signing). Expected:
the valid one returns `202`/accepted; the tampered one returns `401`. You've
proven authenticity + integrity.

### 2. Forge without the secret and fail

From an "attacker" script that doesn't know the secret, POST a
`payment.succeeded` body with a made-up signature. Expected: `401`. The
public URL is not enough to forge — the secret is what gates action. Confirm
no processing task was enqueued.

### 3. Raw-bytes vs. reparsed-JSON gotcha

Change the receiver to verify against `json.dumps(await request.json())`
instead of the raw body. Send a payload whose keys, if reserialized, come out
in a different order or with different spacing. Expected: verification now
*fails* for a legitimate request, because the bytes differ. Revert to
`await request.body()`. Lesson: always sign/verify the exact received bytes.

### 4. Constant-time comparison

Replace `hmac.compare_digest` with `==`. Everything still "works"
functionally. Explain in writing why this is nonetheless a vulnerability (a
timing side channel that leaks how many leading bytes matched, enabling
incremental signature forgery). Restore `compare_digest`. Some bugs don't show
up in a functional test — this is one.

### 5. Replay attack: diagnose and fix

Capture one valid, signed request (save its exact bytes + header). Replay it
(POST the identical bytes + header) 10 minutes later. First, with **no**
timestamp check: expected — it verifies and processes again (a replayed
credit!). Now enable the freshness check (`tolerance=300`). Expected: the
replay is rejected with `401` because its timestamp is stale. This is a
"diagnose and fix" scenario: the symptom is "an event got processed twice from
one real send"; the fix is signing+checking a timestamp.

### 6. Idempotent receiver survives duplicates

Keep the timestamp check but send the *same* event id twice within the window
(a legitimate sender retry). Expected: the first is `accepted` and enqueues a
task; the second returns `duplicate ignored` with `2xx` and enqueues nothing.
Confirm the effect happened exactly once. Note it must be `2xx`, not `500`, or
the sender would keep retrying.

### 7. Ack fast, process later — and prove it

Make `process_event` sleep 8 seconds. Time the `/webhook` response. Expected:
the endpoint returns in milliseconds (it only verified, stored, enqueued)
while the 8-second work happens on the worker. Then move the work *inline*
into the handler and re-time: now the response takes 8s and a sender with a
5s timeout would time out and retry. Restore the async version.

### 8. Steer sender retries with status codes

Simulate three cases and choose the right status: (a) valid, processable event
→ `2xx`; (b) valid event but your datastore is momentarily down → `5xx` (you
*want* a retry); (c) invalid signature → `4xx` (never retry). Have your sender
script implement backoff-on-non-2xx and observe: it retries the `5xx`, stops
on the `4xx`, and stops on the `2xx`. Lesson: the status code is your control
signal to the sender.

### 9. Test against a real tunnel

Start `ngrok http 8000` (or `cloudflared tunnel --url http://localhost:8000`)
to get a public HTTPS URL. Point your sender script (or a real provider's test
webhook / `stripe listen`) at `https://<tunnel>/webhook`. Expected: real
webhooks originating off your machine reach your local receiver over HTTPS.
Confirm your logs show each event's id, type, and signature-valid flag.
Lesson: this is how you develop against senders that can't see `localhost`.

## Independent challenge

No code given. Build a hardened receiver for incoming `payment.succeeded`
webhooks that credits a user's balance. Requirements: reject any request whose
HMAC-SHA256 signature over the raw bytes doesn't verify (constant-time
compare); reject stale requests outside a 5-minute freshness window (replay
defense); serve only over HTTPS; acknowledge with a fast `2xx` after durably
storing the event but before crediting; credit the balance in a background
task that is idempotent per event id so retries and within-window replays
credit exactly once; and return status codes that make a well-behaved sender
retry a transient storage outage but never retry a forged request. Prove
correctness by (a) forging a request and getting `401`, (b) replaying a valid
request and confirming exactly one credit, and (c) sending the same event id
five times and confirming one credit.

This combines the idempotency discipline from
[02-retries-prioritization-and-rate-limiting-in-queues](../02-retries-prioritization-and-rate-limiting-in-queues/README.md)
with the ack-fast pattern that traces back to
[00-task-queues-fundamentals](../00-task-queues-fundamentals/README.md).

<details>
<summary>Hint</summary>

Two independent guards against double-crediting: the freshness window limits
*when* a replay can even be attempted, and the per-event-id idempotency record
(atomic `SET evt:{id} NX`) makes any duplicate that slips through a no-op.
Return `2xx` for both a fresh success and an already-seen duplicate (so the
sender stops), `5xx` only when you couldn't store the event, and `401` for a
bad signature. Persist the raw event before returning `2xx` so a worker crash
doesn't lose it.

</details>

## Common mistakes & troubleshooting

- **Trusting the payload without verifying a signature.** The URL is public;
  anyone can POST. Verify HMAC over the raw bytes with the shared secret before
  acting on anything.
- **Verifying reparsed JSON instead of raw bytes.** Reserializing changes the
  bytes and breaks (or weakens) verification. Verify `await request.body()`
  exactly as received.
- **Comparing signatures with `==`.** Leaks match progress via timing. Use
  `hmac.compare_digest` for constant-time comparison.
- **No freshness/timestamp check.** A captured valid request can be replayed
  and re-processed. Sign and check a timestamp; reject stale requests.
- **Processing inline and blowing the sender's timeout.** Slow inline handling
  causes the sender to time out and retry, amplifying load and duplicates.
  Verify, store, enqueue, return `2xx`; process on a worker.
- **Non-idempotent processing.** Sender retries and replays mean you'll see an
  event id more than once; without a dedupe guard you double-process. Record
  the id atomically and skip if seen.
- **Returning `5xx` for duplicates or forged requests.** A `5xx` makes the
  sender retry forever. Return `2xx` for duplicates (already handled) and `4xx`
  for forged/unverifiable requests (never retry).
- **Testing only against `localhost`.** Real senders can't reach your machine
  directly. Use a tunnel (`ngrok`/`cloudflared`) or the provider's CLI to
  receive real events locally over HTTPS.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why isn't a hard-to-guess webhook URL enough security, and what actually
   authenticates a webhook?
2. Why must you compute the HMAC over the raw received bytes rather than over
   reparsed-and-reserialized JSON?
3. What is a replay attack against a webhook receiver, and what two mechanisms
   together defeat it?
4. Why use `hmac.compare_digest` instead of `==`, given both return the right
   boolean?
5. Describe the ack-fast-process-later pattern and the one thing that must be
   true *before* you return `2xx`.
6. A duplicate event arrives. What status code do you return and why — and
   what happens if you return `500` instead?
7. How do `2xx`, `4xx`, and `5xx` responses each steer a well-behaved sender's
   retry behavior?

<details>
<summary>Answers</summary>

1. The URL travels through logs, dashboards, and history — it isn't secret, so
   anyone who learns it can POST forged events. What authenticates a webhook is
   an HMAC signature computed with a shared secret only the real sender and
   receiver know; a forger without the secret can't produce a valid signature.
2. Because HMAC is over exact bytes; reparsing and reserializing JSON can
   change key order, whitespace, or escaping, so the recomputed signature won't
   match a legitimate request (and any "normalization" to fix that opens a
   verification gap). Verify the exact `request.body()`.
3. An attacker captures a genuinely-signed request and re-sends the identical
   bytes+signature later; it verifies because it really is the sender's signed
   message. Defeated by (1) signing+checking a timestamp so stale requests are
   rejected (freshness window) and (2) idempotent processing keyed by event id
   so any replay that slips inside the window is a no-op.
4. `==` short-circuits on the first differing byte, so its run time leaks how
   many leading bytes matched — a timing side channel that lets an attacker
   forge a signature incrementally. `compare_digest` runs in constant time,
   closing that channel. A functional test won't reveal the difference.
5. On the request, verify the signature+freshness, durably persist the event,
   enqueue a background task, and return `2xx` fast — do no slow work inline.
   Before returning `2xx`, the event must be durably stored, so a worker/
   process crash doesn't lose it; `2xx` means "received and safely stored,"
   not "fully processed."
6. Return `2xx` (and skip re-processing) — you've already handled that event
   id, and `2xx` tells the sender to stop retrying. Returning `500` would make
   the sender treat it as a failure and keep retrying the duplicate
   indefinitely.
7. `2xx` = success (or already-handled) → sender stops. `5xx`/non-2xx =
   temporary failure → sender backs off and retries (use it when you *want* a
   retry, e.g. your store is briefly down). `4xx` = permanent client error
   (bad/forged signature) → well-behaved sender never retries.

</details>

## Further reading & sources

- [Stripe: Verify webhook signatures](https://docs.stripe.com/webhooks/signatures) - the timestamp+HMAC scheme and replay-window check this module models.
- [GitHub: Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) - `X-Hub-Signature-256` HMAC verification with constant-time comparison.
- [Python: hmac module](https://docs.python.org/3/library/hmac.html) - `hmac.new`, `hexdigest`, and `compare_digest` for constant-time comparison.
- [OWASP: Webhook / SSRF and secure design cheat sheets](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) - hardening a public endpoint that acts on untrusted input.
- [ngrok documentation](https://ngrok.com/docs) - exposing a local receiver over HTTPS to test against real senders.

## Next

[07-websockets-and-server-sent-events](../07-websockets-and-server-sent-events/README.md)
— webhooks push events server-to-server. Next you'll push events server-to-
*browser* in real time: when to use WebSockets vs. Server-Sent Events vs.
polling, a real FastAPI WebSocket endpoint, the connection leak a careless
implementation causes, and broadcasting to many connected clients. This module
also carries the track's second cumulative review.
