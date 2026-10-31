# Module 11: Mobile Push Notifications

## Why this matters

Modules 04 through 08 built out every "reach the user outside the
request/response cycle" channel this track covers except one: a
notification that appears on a phone's lock screen even when your app
isn't open and the phone isn't connected to anything you control. That's
a **push notification**, and it's structurally different from everything
so far — you don't deliver it directly. You hand it to Apple (APNs) or
Google (FCM), and *they* deliver it to the device over infrastructure you
don't operate, whenever the device is reachable. This module covers the
concrete mechanics that make that reliable: device tokens (and why they
change), the specific response codes that tell you a token is dead versus
temporarily rate-limited, and the retry/cleanup discipline that keeps
your notification pipeline from silently accumulating garbage tokens or
losing notifications to a transient failure it should have retried.

## Concepts

### You don't push to a phone — you hand off to Apple or Google

Every mobile push, regardless of platform, follows the same shape: your
backend calls a **push provider's HTTP API** (Firebase Cloud Messaging
for Android, and also usable for iOS; Apple Push Notification service
directly for iOS-only integrations) with a **device token** and a
payload; the provider queues and delivers it to the specific device,
using its own persistent connection to that device that you have no
visibility into or control over.

```
  your backend ──POST──► FCM/APNs ──(provider's own connection)──► device
       │                     │
       │                200/404/429/5xx                    (you never talk
       │                 tells you what                     to the device
       └── retry/cleanup    happened                         directly)
       based on THAT response
```

This is why push is fundamentally a **webhook-shaped problem in
reverse** (module 06): instead of you receiving a webhook and needing to
ack fast and process reliably, here *you* are the caller, and the
provider's response code is the only signal you get about what happened
— there's no "the user's phone confirms receipt" callback most of the
time. Your reliability responsibility is entirely about how you react to
that one response.

### Device tokens: an opaque, unstable identifier you must maintain

A **device token** is an opaque string the OS/provider gives a specific
app install on a specific device — not a stable user identifier. Tokens
**change**: on app reinstall, on OS updates, sometimes spontaneously, and
always when a user uninstalls the app (immediately invalidating it).
Your data model must map `user_id → one or more device tokens` (a user
can have multiple devices), refresh the mapping whenever the client
reports a new token, and — critically — **remove tokens the provider
tells you are dead**, which is the single most common mistake this
module addresses.

### The response codes that actually matter

A push provider's send response falls into three categories, and
treating them identically is the core reliability bug of this whole
topic:

- **Success (200-range)** — delivered to the provider's queue for that
  device (not proof the user *saw* it — just that the provider accepted
  it for delivery).
- **Permanent failure — the token is dead** (FCM: `404 UNREGISTERED` /
  `INVALID_ARGUMENT`; APNs: `410 Unregistered` / `BadDeviceToken`) — the
  app was uninstalled, the token expired, or it was simply never valid.
  **Retrying does nothing** — the fix is to delete that token from your
  database so you stop wasting calls (and stop looking broken to
  yourself) sending to a device that will never receive it again.
- **Transient failure** (FCM: `429 RESOURCE_EXHAUSTED`, `5xx`; APNs:
  `429 TooManyRequests`, `5xx`) — the provider is temporarily rejecting
  or failing the request, but the token itself is still potentially
  valid. This *should* be retried, with backoff (module 02's retry
  discipline, applied to this specific external dependency).

```
  Response code          Meaning                    Correct action
  200                    accepted for delivery       done
  404 UNREGISTERED       token is dead, permanently  DELETE the token, don't retry
  429 / 5xx              transient, provider-side    RETRY with backoff
```

Conflating the second and third categories is the module's central
warning: retrying a permanently dead token wastes calls forever and
never succeeds; *not* retrying a transient failure silently drops a
notification that a brief backoff would have delivered.

### Payload constraints: push is small and near-real-time, not a data channel

Push payloads are size-limited (FCM's data payload caps around 4KB) and
are not a reliable place to carry data your app can't afford to lose —
the OS can drop, coalesce, or throttle pushes under normal operating
conditions (low battery, too many pending notifications, a
misbehaving app). The payload should carry **just enough to notify and
let the app fetch the real data itself** when opened — a notification id
and a type, not the full content — the same "keep the message small,
fetch the real state" discipline as module 08's pub/sub payloads, applied
here because the constraint is enforced by the OS rather than by your
own broker.

### Silent (data-only) vs. visible (notification) pushes

A push can carry a **notification payload** (title/body the OS displays
automatically, even if your app isn't running) or a **data-only
("silent") payload** (no automatic UI — your app's code runs in the
background to decide what to do, e.g. "sync now," "a new message
arrived, update the badge count"). Silent pushes are throttled more
aggressively by both platforms specifically because they're invisible to
the user and easy to abuse for constant background wake-ups — design for
them being **best-effort, not guaranteed-delivery**, the same
"at-most-once, no guarantee" posture module 08 gave Redis Pub/Sub, for a
different underlying reason (OS-level battery/abuse throttling instead of
no-subscriber drops).

### Idempotency and de-duplication, once more

If your send path retries on a transient failure, you can end up calling
the provider twice for the same logical notification (module 02's
retry-causes-duplication lesson, again). Because push providers don't
generally offer a request-level idempotency key the way some payment
APIs do, the practical mitigation is **client-side**: include a stable
notification id in the payload, and have the app's notification-handling
code de-duplicate on that id before displaying/acting on it a second
time — pushing the idempotency responsibility to the one place that can
actually enforce "don't show this twice."

## Command reference

There's no universal local push provider to run — production sends go
to real APNs/FCM endpoints requiring a real project and real device.
This module's exercises instead run a **local mock provider** that
reproduces the exact response codes (200/404/429) a real FCM endpoint
returns, so you build and test real retry/cleanup logic against real
HTTP responses rather than reading about them.

| Concern | httpx (Python) against the mock provider |
|---|---|
| Send a push | `httpx.post(url, json={"message": {"token": ..., "notification": {...}}})` |
| Check for permanent failure | `resp.status_code == 404 and resp.json()["error"]["status"] in {"UNREGISTERED", "INVALID_ARGUMENT"}` |
| Check for transient failure | `resp.status_code == 429 or resp.status_code >= 500` |
| Retry with backoff | `time.sleep(backoff); continue` (module 02's pattern, applied here) |

A send function with the correct three-way response handling:

```python
import httpx, time

def send_push(token: str, title: str, body: str, notification_id: str, max_attempts=3):
    for attempt in range(1, max_attempts + 1):
        resp = httpx.post(
            "https://fcm.googleapis.com/v1/projects/my-app/messages:send",
            json={"message": {
                "token": token,
                "notification": {"title": title, "body": body},
                "data": {"notification_id": notification_id},  # for client-side de-dup
            }},
        )
        if resp.status_code == 200:
            return "sent"
        error_status = resp.json().get("error", {}).get("status")
        if resp.status_code == 404 and error_status in {"UNREGISTERED", "INVALID_ARGUMENT"}:
            return "invalid_token"          # permanent -- caller must delete the token
        if resp.status_code == 429 or resp.status_code >= 500:
            if attempt < max_attempts:
                time.sleep(0.2 * attempt)   # transient -- backoff and retry
                continue
            return "retries_exhausted"
        return "unknown_error"
    return "exhausted"
```

## Hands-on exercises

`pip install fastapi uvicorn httpx`. A local mock provider stands in for
real FCM so you can exercise real response-handling logic without a
Firebase project or a physical device.

### 1. Build the mock push provider

```python
# mock_fcm.py
from fastapi import FastAPI, Request, Response
import json

app = FastAPI()

INVALID_TOKENS = {"invalid-token-1"}
rate_limited_once = {"rate-limited-token": False}

@app.post("/v1/projects/demo/messages:send")
async def send(request: Request):
    body = await request.json()
    token = body["message"]["token"]
    if token in INVALID_TOKENS:
        return Response(status_code=404,
            content=json.dumps({"error": {"status": "UNREGISTERED"}}),
            media_type="application/json")
    if token == "rate-limited-token" and not rate_limited_once[token]:
        rate_limited_once[token] = True
        return Response(status_code=429,
            content=json.dumps({"error": {"status": "RESOURCE_EXHAUSTED"}}),
            media_type="application/json")
    return {"name": f"projects/demo/messages/fake-{token}"}
```

```bash
python3 -m uvicorn mock_fcm:app --port 8500
```

### 2. Send to a valid token

```bash
curl -s -X POST http://localhost:8500/v1/projects/demo/messages:send \
  -H "Content-Type: application/json" \
  -d '{"message":{"token":"good-token","notification":{"title":"hi"}}}'
```

Expected: `{"name":"projects/demo/messages/fake-good-token"}` — a
successful accept, standing in for what a real FCM `200` looks like.

### 3. Send to a dead token and confirm the permanent-failure signal

```bash
curl -s -i -X POST http://localhost:8500/v1/projects/demo/messages:send \
  -H "Content-Type: application/json" \
  -d '{"message":{"token":"invalid-token-1"}}'
```

Expected: `HTTP/1.1 404 Not Found` with `"status": "UNREGISTERED"` in the
body — this is the exact signal that means "delete this token, don't
retry," reproduced faithfully from FCM's real HTTP v1 API error shape.

### 4. Send to a token that's transiently rate-limited, then recovers

```bash
curl -s -i -X POST http://localhost:8500/v1/projects/demo/messages:send \
  -H "Content-Type: application/json" \
  -d '{"message":{"token":"rate-limited-token"}}' | head -3
curl -s -X POST http://localhost:8500/v1/projects/demo/messages:send \
  -H "Content-Type: application/json" \
  -d '{"message":{"token":"rate-limited-token"}}'
```

Expected: the first call returns `429`; the second call (the same token)
succeeds — the mock models a genuinely transient failure, distinct from
the permanent one in exercise 3.

### 5. Run the real client against all three cases and let it react correctly

Using `send_push` from the Command reference, run it against a small
"database" of users and tokens covering all three cases:

```python
db_tokens = {"user-1": "invalid-token-1", "user-2": "good-token", "user-3": "rate-limited-token"}
removed_tokens = []

for user, token in db_tokens.items():
    result = send_push(token, "Hello", f"Notification for {user}", notification_id="n-1")
    print(f"{user} (token={token}): {result}")
    if result == "invalid_token":
        removed_tokens.append(user)

print("tokens to remove from DB:", removed_tokens)
```

Expected: `user-1` returns `invalid_token` (and is queued for deletion —
never retried); `user-2` returns `sent` immediately; `user-3` returns
`sent` too, but only after the function's internal retry absorbed the
one `429` with a backoff — confirm this by temporarily adding a print
inside the retry branch and observing it fires exactly once for
`user-3`. This is the full three-way response handling working
correctly against real HTTP responses, not asserted behavior.

### 6. Diagnose and fix: a notification pipeline that gets slower every week

A team's push-sending job has been running for months. Send latency has
crept up noticeably, and monitoring shows a growing fraction of calls to
the provider return `404 UNREGISTERED`. The on-call engineer's first
instinct is "the provider is having problems, add more retries."

<details>
<summary>Solution</summary>

Root cause: the team's send path never deletes tokens after a
`404 UNREGISTERED` response — every uninstalled app, every expired
token, every device that will never receive another push is *still* in
the send list, permanently. Every send cycle wastes an ever-growing
number of calls on tokens the provider has already told them, repeatedly,
are dead. Adding retries would make this actively worse: retrying a
permanent failure never succeeds and only adds more wasted calls per
dead token.

Fix: treat `404 UNREGISTERED`/`INVALID_ARGUMENT` (FCM) or
`410 Unregistered`/`BadDeviceToken` (APNs) as a **signal to delete that
token from your database immediately**, not a transient error to retry.
Add this as a first-class part of the send path (as in `send_push`
above) rather than something noticed later in cleanup — the token list
should only ever shrink for dead devices and grow for genuinely new
ones, never silently accumulate permanently-dead entries.

</details>

### 7. Clean up

```bash
# Ctrl+C the running mock_fcm uvicorn process.
```

## Independent challenge

No code given. Design a push-notification pipeline for an e-commerce
app that sends: (1) an order-shipped notification (visible, must reach
the user reliably, one per shipment) and (2) a silent, data-only push
telling the app to refresh its "recommended for you" cache in the
background (best-effort, fine to miss). For each, specify: which
response codes require a retry vs. a token deletion vs. neither; how you
prevent a retried send from showing the user two copies of the same
shipped notification; and what happens to each notification type if the
provider is degraded and returning `5xx` for ten minutes straight.
Justify why the two notification types deserve genuinely different
reliability treatment, tying back to this module's silent-vs-visible
distinction.

<details>
<summary>Stuck? One hint</summary>

Both notification types use the same three-way response handling
(delete on permanent failure, retry-with-backoff on transient failure);
the difference is in how hard you try and what "acceptable to lose"
means for each. The shipped notification is worth queuing for retry
across the full 10-minute outage (module 02's retry/backoff, since a
customer genuinely needs to know their order shipped) — it may even
belong on a durable task queue (module 00) rather than a fire-and-forget
call, so a long provider outage doesn't lose it. The recommendation
refresh is fine to simply drop if the provider is down for those ten
minutes — the app will just show slightly stale recommendations until
the next successful silent push, no user-facing harm. De-duplication for
the shipped notification uses the stable `notification_id`
(one per shipment) so a retried send that actually succeeded twice on
the provider's side still only displays once on the device.

</details>

## Common mistakes & troubleshooting

- **Retrying a permanent failure.** A `404 UNREGISTERED`/`410
  Unregistered` means the token is dead — no amount of retrying changes
  that. Exercise 6 showed the real cost: wasted calls that compound
  forever if the token is never deleted.
- **Not retrying a transient failure.** A `429`/`5xx` is often
  recoverable within seconds — dropping the notification on the first
  failure instead of backing off and retrying loses messages a brief
  wait would have delivered.
- **Treating device tokens as stable user identifiers.** They rotate on
  reinstall, OS updates, and uninstall. Your data model needs
  `user → tokens` (plural), refreshed whenever the client reports a new
  one, not a single token cached indefinitely.
- **Putting real application data in the push payload.** Size limits
  and OS-level throttling/coalescing make push payloads unreliable as a
  data channel — send just enough to identify what changed, and let the
  app fetch the real content once it's running.
- **Assuming silent pushes are guaranteed delivery.** Both platforms
  throttle data-only pushes more aggressively than visible ones — design
  background-refresh-style pushes as best-effort, never as your only
  path to a piece of required data.
- **No de-duplication on the client for a retried send.** If your send
  path retries and the provider actually delivered both attempts, the
  device needs to recognize the same `notification_id` and avoid
  displaying it twice — module 02's retry-causes-duplication lesson,
  here enforced client-side because the provider gives you no
  server-side idempotency key.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why is sending a push notification structurally different from every
   other outbound channel this track has covered (email, webhooks,
   WebSockets)?
2. What does a `404 UNREGISTERED` (FCM) or `410 Unregistered` (APNs)
   response mean, and what's the correct reaction — and the incorrect
   one?
3. What's the correct reaction to a `429` or `5xx` response, and why is
   it different from the reaction to question 2's response?
4. Why shouldn't a push payload carry the actual data a feature needs,
   rather than just enough to identify what changed?
5. What's the difference between a visible (notification) push and a
   silent (data-only) push, and why are silent pushes throttled more
   aggressively?
6. Since push providers generally don't offer a server-side idempotency
   key, where does the responsibility for avoiding a duplicate-looking
   notification actually live?

<details>
<summary>Answers</summary>

1. You never deliver directly to the device — you hand the notification
   to a provider (APNs/FCM) that owns the actual connection to the
   device and delivers it on infrastructure you don't control. The
   provider's HTTP response code is effectively your only signal about
   what happened, unlike a webhook you receive yourself or a WebSocket
   connection you hold open.
2. It means the token is permanently dead (app uninstalled, token
   expired/invalid) and will never succeed again. Correct reaction:
   delete the token from your database immediately. Incorrect reaction:
   retrying it, which wastes calls forever and never succeeds.
3. Retry with backoff — the failure is transient/provider-side and the
   token may still be perfectly valid; a brief wait is likely to
   succeed. It's different from question 2's response because that one
   is permanent (retrying is pointless) while this one is temporary
   (retrying is exactly the right move, per module 02's discipline).
4. Push payloads are size-limited (a few KB) and can be dropped,
   coalesced, or throttled by the OS under normal conditions — they're
   not a reliable data channel. The safer design sends just enough
   (an id, a type) to let the app fetch the real, authoritative data
   itself once it's running.
5. A visible push carries a notification payload the OS displays
   automatically even if the app isn't running; a silent/data-only push
   has no automatic UI and instead runs the app's background code. Silent
   pushes are throttled more aggressively because they're invisible to
   the user and easier to abuse for constant background wake-ups/battery
   drain.
6. On the client: include a stable notification id in the payload and
   have the app's notification-handling code de-duplicate on that id
   before displaying or acting on it a second time, since the provider
   itself doesn't offer a request-level idempotency guarantee the way
   some other APIs do.

</details>

## Further reading & sources

- [Firebase Cloud Messaging: HTTP v1 API reference](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages) - the exact request/response shape (including error statuses) this module's mock provider reproduces.
- [Firebase Cloud Messaging: Error codes](https://firebase.google.com/docs/cloud-messaging/send-message#rest-error-codes) - `UNREGISTERED`, `INVALID_ARGUMENT`, and the rest of the response taxonomy behind this module's permanent-vs-transient distinction.
- [Apple: Sending notification requests to APNs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns) - the APNs-side equivalents (`410 Unregistered`, `BadDeviceToken`) referenced throughout.
- [Apple: Pushing background updates](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app) - the official treatment of silent/background pushes and their best-effort delivery guarantees.
- [Firebase: About FCM messages — message size limits](https://firebase.google.com/docs/cloud-messaging/concept-options#notifications_and_data_messages) - the payload-size constraint behind this module's "keep it small, fetch the rest" guidance.

## Next

[12-payment-processing-in-practice](../12-payment-processing-in-practice/README.md)
— module 06's webhook fundamentals meet a real, unforgiving external
system: a payment provider's webhook stream, where idempotency keys and
signature verification aren't optional hardening but the only thing
standing between you and double-charging a real customer's real card.
</content>
