# Module 04: Transactional Emails

## Why this matters

Every serious application sends email that isn't marketing: "confirm your
address," "your password was reset," "here's your receipt," "your order
shipped." These are **transactional emails** — triggered by a specific user
action or system event, sent to one person, containing information they're
expecting and often need. They're distinct from bulk/marketing mail in intent,
in the infrastructure you send them through, and in the rules that govern
them (transactional mail generally doesn't require the unsubscribe machinery
marketing does, precisely because the user asked for the action that
triggered it).

Two things make this a backend-engineering topic and not a copywriting one.
First, **sending email is slow, I/O-bound, third-party work** — the exact
profile of something that belongs in a background task, not the request-
response cycle. You've been using "send an email" as the canonical slow task
since module 00; now you build it for real, from a Celery task, with retries
and idempotency so a network blip doesn't drop a receipt and a redelivery
doesn't send it twice. Second, **an email you send isn't an email that
arrives.** Deliverability — whether the receiving server trusts you enough to
put your message in the inbox instead of spam or the trash — depends on DNS
records (SPF, DKIM, DMARC) and sending reputation that most engineers have
never had to think about until the day the receipts stop showing up.

This module covers the anatomy of a transactional email, personalizing it
safely with dynamic data, sending it from a background task, and the
deliverability fundamentals every backend engineer should be able to reason
about.

## Concepts

### Anatomy of a transactional email

A well-built transactional email has recognizable parts, each with a job:

- **Subject line** — short, specific, and it *is* the email as far as an inbox
  list is concerned. "Your Acme order #10432 has shipped" beats "Order
  update." Include the concrete identifier.
- **Preheader** — the snippet of text the inbox shows after the subject
  (pulled from the first text in the body). If you don't set it deliberately,
  the client grabs whatever comes first — often "View in browser" or a blank —
  wasting prime real estate. Set it explicitly with a hidden preheader element.
- **Header** — your logo/brand at the top so the reader instantly knows who
  it's from and that it's legitimate.
- **Body** — the actual content. For transactional mail, lead with the fact
  the user needs (the code, the receipt, the status) — don't bury it under
  marketing.
- **Call to action (CTA)** — the single button/link you want them to click
  ("Confirm your email," "View your receipt"). One primary CTA, visually
  distinct, with the destination also available as a plain URL for clients
  that don't render buttons.
- **Footer** — who you are, a physical address (a legal requirement in many
  jurisdictions), and context ("You're receiving this because you created an
  account"). Transactional mail typically doesn't need an unsubscribe link,
  but the footer still establishes legitimacy.

Almost always you send **both** a plain-text and an HTML part (a `multipart/
alternative` message). The client shows whichever it prefers; having a text
part improves deliverability and serves clients/readers that don't render HTML.

### Templating and personalizing with dynamic parameters

Transactional emails are templates with holes: `Hi {{ name }}, your order
{{ order_id }} shipped and will arrive by {{ eta }}.` You render the template
with per-recipient data at send time. Two rules that matter:

1. **Autoescape HTML.** Personalization data (names, addresses, product
   titles) can contain characters like `<`, `>`, `&` that break — or inject
   into — your HTML. Use a templating engine with autoescaping on (Jinja2's
   `autoescape=True`) so user-supplied values are escaped, exactly like you'd
   escape output in a web page. An unescaped display name is an HTML-injection
   vector in your own emails.

2. **Pass the *data*, render in the task.** The producer enqueues
   `send_receipt.delay(order_id)`; the task re-fetches the order and renders
   the template. Don't render a giant HTML string in the request handler and
   ship it through the broker — that's slow work in the wrong place and a
   large, stale message on the queue.

### Sending from a background task

Sending mail is a network round-trip to an SMTP server or an email API
(SendGrid, SES, Postmark, Mailgun) that can take hundreds of milliseconds to
several seconds and can fail transiently. That's textbook background work.
The task, tying together everything from modules 00-02:

- Is enqueued with `.delay()` so the request returns immediately.
- **Retries** transient failures (SMTP timeout, `5xx` from the API) with
  exponential backoff; does **not** retry permanent ones (a malformed address,
  a `400`).
- Is **idempotent** — keyed by (recipient, email-type, triggering-event), it
  checks a "have I already sent this?" record before sending, so an
  at-least-once redelivery or a retry-after-partial-success can't send two
  receipts for one order.

### Deliverability basics: SPF, DKIM, DMARC (conceptually)

Getting into the inbox is a trust problem. Receiving servers ask: "is this
sender allowed to send for this domain, and has the message been tampered
with?" Three DNS-based mechanisms answer that, and you should understand what
each does even though you configure them in DNS, not in code:

- **SPF (Sender Policy Framework)** — a DNS `TXT` record listing which mail
  servers/IPs are *authorized* to send email for your domain. The receiver
  checks the connecting server's IP against that list. Think of it as a guest
  list for who may send "From: you@yourdomain.com."
- **DKIM (DomainKeys Identified Mail)** — your sending server signs each
  message with a private key; you publish the matching public key in DNS. The
  receiver verifies the signature, proving the message really came from your
  domain and wasn't altered in transit. Think of it as a tamper-evident seal.
- **DMARC (Domain-based Message Authentication, Reporting & Conformance)** — a
  DNS policy that ties SPF and DKIM together: it tells receivers what to do
  with mail that *fails* those checks (accept / quarantine to spam / reject)
  and where to send reports. Think of it as the policy statement layered on
  top of the guest list and the seal.

Beyond these three: **sending reputation** (established over time by low spam-
complaint and bounce rates), using a **dedicated sending domain/subdomain**,
handling **bounces and complaints** (stop mailing addresses that hard-bounce),
and warming up new sending IPs gradually. As a backend engineer you rarely
hand-implement SPF/DKIM — a reputable email provider signs with DKIM for you
and tells you the SPF/DMARC records to publish — but when receipts land in
spam, this is the layer you reason about.

### Use a provider; don't run your own mail server

For almost everyone, the right architecture is: your Celery task calls a
transactional-email **provider's API** (or authenticated SMTP relay), and the
provider handles the hard parts — DKIM signing, IP reputation, bounce
processing, ret/deliverability analytics. Running your own outbound SMTP
server correctly (reverse DNS, reputation, blocklist management) is a
specialized ops job. The engineering skill here is integrating a provider
cleanly from a reliable background task, not operating Postfix.

## Command reference

| Concern | Tool / approach |
|---|---|
| Build a MIME message | `email.message.EmailMessage` (stdlib) |
| Both text + HTML | `msg.set_content(text)` + `msg.add_alternative(html, subtype="html")` |
| Render template safely | Jinja2 with `autoescape=True` |
| Set a preheader | hidden `<span>` as the first body element |
| Send via SMTP | `smtplib.SMTP(...).send_message(msg)` |
| Send via provider API | provider SDK / `requests.post(...)` with API key |
| Local SMTP for dev | MailHog / Mailpit in Docker (catches mail, never delivers) |
| Retry transient sends | `autoretry_for=(smtplib.SMTPException, requests.RequestException)` |
| Idempotency | unique `(recipient, email_type, event_id)` record |
| SPF / DKIM / DMARC | DNS records (provider gives you the values) |

A transactional-email task, end to end — `emails.py`:

```python
import smtplib
from email.message import EmailMessage
from jinja2 import Environment, DictLoader, select_autoescape
from celery import Celery

app = Celery("mail", broker="redis://localhost:6379/0",
             backend="redis://localhost:6379/1")

# Autoescaping ON: personalization data is escaped like web output.
env = Environment(
    loader=DictLoader({
        "receipt.html": """
            <span style="display:none">Your Acme receipt for order {{ order_id }}</span>
            <img src="https://cdn.acme.example/logo.png" alt="Acme">
            <h1>Thanks, {{ name }}!</h1>
            <p>Order <strong>{{ order_id }}</strong> — total ${{ total }}.</p>
            <p><a href="{{ receipt_url }}"
                  style="background:#2563eb;color:#fff;padding:12px 20px;">
               View your receipt</a></p>
            <p>Or paste this link: {{ receipt_url }}</p>
            <hr><small>Acme Inc, 1 Market St. You received this because you
            placed an order.</small>
        """,
        "receipt.txt": """Thanks, {{ name }}!
Order {{ order_id }} — total ${{ total }}.
View your receipt: {{ receipt_url }}
Acme Inc, 1 Market St.""",
    }),
    autoescape=select_autoescape(["html"]),
)

def build_receipt(to_addr, ctx):
    msg = EmailMessage()
    msg["Subject"] = f"Your Acme order {ctx['order_id']} — receipt"
    msg["From"] = "receipts@acme.example"
    msg["To"] = to_addr
    msg.set_content(env.get_template("receipt.txt").render(**ctx))          # text part
    msg.add_alternative(env.get_template("receipt.html").render(**ctx),     # html part
                        subtype="html")
    return msg

@app.task(
    bind=True,
    autoretry_for=(smtplib.SMTPException, ConnectionError),
    max_retries=5, retry_backoff=True, retry_jitter=True,
)
def send_receipt(self, order_id):
    order = get_order(order_id)                     # re-fetch fresh data in the task
    # IDEMPOTENCY: don't send the same receipt twice on retry/redelivery.
    if already_sent(order_id, "receipt"):
        return "already sent"
    ctx = {"name": order.customer_name, "order_id": order_id,
           "total": order.total, "receipt_url": order.receipt_url}
    msg = build_receipt(order.email, ctx)
    with smtplib.SMTP("localhost", 1025) as smtp:   # MailHog in dev
        smtp.send_message(msg)
    mark_sent(order_id, "receipt")                  # atomic record after success
    return "sent"
```

The producer just enqueues:

```python
@api.post("/orders/{order_id}/confirm")
def confirm(order_id: int):
    send_receipt.delay(order_id)          # fast; the send happens on a worker
    return {"status": "accepted"}
```

## Hands-on exercises

Continue in `bg-queues`. `pip install jinja2`. Run a fake SMTP server so you
can send mail without a provider and inspect what you sent:

```bash
docker run -d --name mailhog -p 1025:1025 -p 8025:8025 mailhog/mailhog
# SMTP on 1025; web UI to view captured mail on http://localhost:8025
```

### 1. Send your first captured email

Implement `build_receipt` and a task that sends to MailHog on port 1025.
Enqueue it. Expected: the message appears in the MailHog UI at
`localhost:8025` — nothing was actually delivered to a real inbox, but you can
inspect the exact bytes you produced. This is the safe way to develop email.

### 2. Inspect the multipart structure

In the MailHog UI, view the message source. Expected: a `multipart/
alternative` with both a `text/plain` and a `text/html` part. Toggle MailHog's
HTML/plain view. Lesson: you shipped both; the client picks. Remove the
`set_content` call and confirm you now have HTML only (worse for
deliverability and text-only clients).

### 3. Set and verify a preheader

Confirm the hidden `<span>` renders as the inbox preview snippet (MailHog
shows a snippet). Change it to something meaningful vs. leaving it off and
letting "View your receipt" become the preview. Expected: with the preheader
set, the preview text is the summary you chose, not a random first link.

### 4. Personalize with dynamic data

Render the template with two different orders (different name, order_id,
total). Expected: two distinct emails from one template. Confirm the CTA link
carries the correct per-order `receipt_url`.

### 5. Autoescaping stops HTML injection

Set a customer name to `Ada <script>alert(1)</script>` and render. Expected:
with `autoescape` on, the name appears escaped (`&lt;script&gt;...`) in the
HTML part — inert. Turn autoescaping off and re-render: the `<script>` now sits
raw in your HTML. Lesson: personalization data is untrusted output; escape it.

### 6. Send from the request path without blocking

Wire `POST /orders/{id}/confirm` to `send_receipt.delay(id)` and time it:

```bash
curl -w "\n%{time_total}s\n" -X POST localhost:8000/orders/1/confirm
```

Expected: the endpoint returns in milliseconds; the email shows up in MailHog
a moment later, sent by the worker. The user never waited on SMTP.

### 7. Idempotent send survives a retry

Implement `already_sent`/`mark_sent` against an in-memory set keyed by
`(order_id, "receipt")`. Force the SMTP send to raise once (point it at a
closed port, then fix it) so the task retries. Expected: exactly one message
in MailHog despite the retry — the guard prevented a duplicate. Then enqueue
the same `order_id` twice manually: still one email.

### 8. Retry only transient failures

Point the task at a dead SMTP port so `smtplib` raises `ConnectionError`
(transient — in `autoretry_for`). Expected: it retries with backoff. Now make
`build_receipt` raise a `ValueError` on a bad address (permanent — not in
`autoretry_for`). Expected: it fails immediately, no retries. Lesson: a bad
address won't fix itself; don't retry it.

### 9. Diagnose and fix: receipts landing in spam / never arriving

Reports: "customers say order receipts go to spam, and some never arrive." The
sending code works and MailHog shows the messages in dev. Walk through the
deliverability checklist you'd apply in production: (a) is there an **SPF**
record authorizing your provider's IPs to send for your domain? (b) is
**DKIM** signing enabled (usually by the provider) with the public key
published in DNS? (c) is there a **DMARC** policy, and is legitimate mail
passing it? (d) are you sending HTML-only with no text part, or from a
brand-new domain/IP with no reputation? (e) are hard-bounced addresses being
removed so your bounce rate doesn't wreck your reputation? Write the
one-sentence purpose of SPF, DKIM, and DMARC as part of your answer.

<details>
<summary>Solution</summary>

The code being correct in dev is exactly why this is a *deliverability*
problem, not a sending bug. Checklist:

- **SPF** — publish a DNS `TXT` record that authorizes your email provider's
  sending servers to send for your domain. Without it (or with the wrong
  provider listed), receivers distrust the mail. *SPF says which servers are
  allowed to send for your domain.*
- **DKIM** — enable DKIM signing (your provider signs with a private key) and
  publish the matching public key in DNS. *DKIM cryptographically proves the
  message came from your domain and wasn't altered.*
- **DMARC** — publish a DMARC policy so receivers know to trust/quarantine/
  reject mail failing SPF/DKIM, and monitor its reports to catch failures.
  *DMARC tells receivers what to do when SPF/DKIM fail and gives you reporting.*
- **Content/reputation** — send `multipart/alternative` (include the text
  part), avoid spammy content, and build reputation gradually from a dedicated
  sending domain; a brand-new domain sending a burst looks like spam.
- **Bounces/complaints** — suppress hard-bounced and complained addresses;
  high bounce/complaint rates tank your reputation and land future mail in
  spam.

Fix in practice: use a reputable provider, publish the SPF/DKIM/DMARC records
they give you, verify with their deliverability dashboard, include a text
part, and process bounces. The application send code was never the problem.

</details>

## Independent challenge

No code given. Build a "password reset" email flow: `POST /password-reset`
accepts an email, and *regardless of whether the account exists* returns the
same `202` response immediately (don't leak which addresses are registered).
If the account exists, a background task sends a transactional reset email
with a one-time, expiring reset link, a clear single CTA, a preheader, both
text and HTML parts, and autoescaped personalization. Make the send retry
transient failures but not permanent ones, and idempotent per reset request
so a redelivery can't send two emails with two different valid links. Verify
the whole flow against MailHog.

Reuse the fast-response-then-background-task shape from
[00-task-queues-fundamentals](../00-task-queues-fundamentals/README.md), the
transient-vs-permanent retry split from
[02-retries-prioritization-and-rate-limiting-in-queues](../02-retries-prioritization-and-rate-limiting-in-queues/README.md),
and the idempotency guard from this module.

<details>
<summary>Hint</summary>

Idempotency here is subtle: key the guard on the *reset-request id* (generate
one per `POST`), not on the email address — otherwise a legitimate second
reset request days later would be suppressed. The endpoint returning an
identical response whether or not the account exists is a security property
(user enumeration prevention) from track 03; the email only gets enqueued when
the account is real, but the caller can't tell the difference from the
response.

</details>

## Common mistakes & troubleshooting

- **Sending email inside the request handler.** SMTP/API calls are slow,
  I/O-bound third-party work — enqueue a task and return; don't make the user
  wait on your mail provider.
- **HTML-only, no text part.** Hurts deliverability and breaks text-only
  clients. Send `multipart/alternative` with both parts.
- **Unescaped personalization.** A display name or product title containing
  `<`/`>` breaks or injects into your HTML. Render with autoescaping on.
- **Non-idempotent sends.** A retry or redelivery sends a second receipt.
  Guard with a `(recipient, type, event)` uniqueness check before sending.
- **Retrying permanent failures.** A malformed address or `400` won't succeed
  on retry — it just delays the failure. Only retry transient errors.
- **No preheader set.** The inbox grabs whatever text is first ("View in
  browser," a link, or nothing), wasting the preview line. Set it explicitly.
- **Ignoring SPF/DKIM/DMARC and bounces.** Correct sending code still lands in
  spam without authenticated DNS records, sender reputation, and bounce
  suppression. That's the deliverability layer, and it lives in DNS and your
  provider, not your task code.
- **Running your own SMTP server to save money.** Reputation, reverse DNS, and
  blocklist management are a specialized job; use a provider and integrate it
  from a reliable task.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What distinguishes a transactional email from a marketing email, and why
   does that distinction affect things like the unsubscribe requirement?
2. Why do you send both a text and an HTML part, and what's the MIME type of
   the combined message?
3. What is a preheader, and what happens if you don't set one deliberately?
4. Why must personalization data be autoescaped when rendered into HTML? Give
   the concrete risk.
5. Why does sending email belong in a background task, and which two
   reliability properties from earlier modules must that task have?
6. In one sentence each, what do SPF, DKIM, and DMARC do?
7. Your send code works in dev (MailHog) but production receipts land in spam.
   Name three things you'd check, none of which is the application code.

<details>
<summary>Answers</summary>

1. A transactional email is triggered by a specific user action/event, sent to
   one recipient, containing information they're expecting (receipt, reset,
   confirmation); marketing email is bulk promotional content sent on your
   schedule. Because the user's action triggered a transactional message and
   they need it, it generally doesn't require the unsubscribe machinery
   marketing (unsolicited/promotional) mail legally does.
2. So the recipient's client can display whichever it supports — HTML for rich
   clients, plain text for text-only ones — and because including a text part
   improves deliverability. The combined message is `multipart/alternative`.
3. The preheader is the preview snippet an inbox shows after the subject. If
   you don't set it, the client pulls whatever text comes first (often "View
   in browser," a link, or nothing), wasting a prime piece of preview real
   estate.
4. Because personalization values (names, product titles) are untrusted data
   that may contain `<`, `>`, `&`; rendered unescaped they break your HTML or
   inject markup/script into your own email. Autoescaping neutralizes them,
   exactly like escaping output on a web page.
5. Because sending is slow, I/O-bound, third-party work that shouldn't block
   the request-response cycle. The task must (1) retry transient failures with
   backoff (not permanent ones) and (2) be idempotent so a retry/redelivery
   doesn't send the message twice.
6. SPF: a DNS record listing which servers are authorized to send mail for
   your domain. DKIM: a cryptographic signature (public key in DNS) proving
   the message came from your domain unaltered. DMARC: a DNS policy telling
   receivers what to do when SPF/DKIM fail, plus reporting.
7. Any three of: SPF record present/correct; DKIM signing enabled and key
   published; DMARC policy present and mail passing it; sending domain/IP
   reputation and whether it's brand-new; whether you include a text part;
   whether hard bounces/complaints are being suppressed.

</details>

## Next

[05-webhooks-fundamentals](../05-webhooks-fundamentals/README.md) — emails
notify *humans* of events. Webhooks notify *other systems* of events. Next
you'll flip to the sender's side of an integration: what a webhook is, how
push differs from polling, and how to design a webhook payload and delivery
system that other developers will build on.
