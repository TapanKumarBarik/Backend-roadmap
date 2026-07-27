# Module 10: Capstone Project

## Why this matters

Every module in this track taught one capability in isolation: enqueue slow
work, chain and retry it, schedule it, send transactional email, emit and
receive webhooks, push updates in real time, decouple with pub/sub, and handle
large files. Real systems don't use these one at a time — they compose them
into a single flow where a user action fans out into a coordinated pipeline of
background work that reports back through several channels at once.

This capstone makes you build exactly that: an **asynchronous file-processing
service**. A user uploads a file; that upload triggers a background pipeline;
when processing finishes, the system notifies a partner via webhook, pushes
live progress and completion to the uploader over a real-time connection, and
sends a transactional "your file is ready" email. Woven through all of it are
the reliability disciplines the track kept hammering — retries with backoff,
idempotency so nothing double-fires, and connection cleanup so nothing leaks.

There's no solution code here. If you can build this and defend the design
choices, you've genuinely absorbed the track. If you get stuck, the module
that taught the piece you're stuck on is named throughout — go back and redo
its exercises rather than guessing.

## The project

Build a FastAPI service, backed by Celery + Redis and S3-compatible object
storage (MinIO), that processes uploaded files asynchronously and reports
completion through three independent channels.

### Core flow

1. **Upload (module 09).** A user uploads a file. Do this the scalable way:
   issue a **presigned URL** so the client uploads directly to object storage,
   and expose a completion callback the client hits when the direct upload
   finishes. On completion, record only a *pointer* (bucket + key + metadata +
   an owner and a status) in your database — never the bytes — and kick off the
   pipeline keyed by the object key. (A simpler streamed-through-the-API upload
   is acceptable as a fallback, but the presigned flow is the target.)

2. **Background processing pipeline (modules 00-02).** Enqueue a Celery
   pipeline that reads the object *from storage by key* (not from a request),
   does multi-step work (simulate: validate → transcode/convert → generate a
   thumbnail/summary), and writes results back to storage. Wire the steps so a
   failure in one step stops the rest (a **chain**), each step **retries**
   transient failures with exponential backoff (never permanent ones), and
   every step is **idempotent** so a retry or at-least-once redelivery can't
   double-process or produce duplicate output.

3. **Webhook notification (modules 05-06).** When processing completes, emit a
   `file.processed` event to any registered partner endpoints. As the
   **sender**: emit the event atomically with the "done" state change (a
   transactional outbox — no webhook for a rolled-back completion), deliver it
   from a background task with backoff retries and a stable event id reused
   across retries, fan out one delivery task per endpoint, and sign each
   delivery with **HMAC** so receivers can verify it. Provide (or describe) a
   **receiver** that verifies the signature over the raw bytes with constant-
   time comparison, rejects stale requests, acks fast, and dedupes by event id.

4. **Real-time progress to the uploader (module 07).** While the pipeline runs,
   push each state change (queued → validating → processing → done/failed) to
   the uploader over a real-time connection. Choose **SSE or WebSocket** and
   justify the choice (does the client need to send anything over the channel?).
   Guarantee **connection cleanup** on every disconnect path — no leaked
   connections — and include a heartbeat so a silently-dead client is reclaimed.
   If you run more than one server process, use a **Redis Pub/Sub backplane
   (module 08)** so progress reaches the uploader regardless of which process
   they're connected to.

5. **Completion email (module 04).** Send a transactional "your file is ready"
   email from a background task: proper anatomy (subject, preheader, header,
   body, single CTA linking to a presigned download URL, footer), both text and
   HTML parts, autoescaped personalization, retry on transient send failures
   only, and idempotent per (file, "ready") so a retry can't send two emails.
   Test against MailHog.

### Acceptance checklist

Your build is done when all of these are true and you can demonstrate each:

- [ ] A large file can be uploaded **directly to object storage via a presigned
      URL**; your API process's memory/CPU stay flat during the transfer.
- [ ] The database contains only a **pointer + metadata**, never file bytes.
- [ ] The upload triggers a Celery **chain**; a forced failure in an early step
      **stops** the later steps and surfaces the failure (not a silent success).
- [ ] Each pipeline step **retries transient failures with backoff** and does
      **not** retry permanent ones; re-running the whole pipeline on the same
      file produces **no duplicate** output (idempotent).
- [ ] On completion, a `file.processed` webhook is delivered to each registered
      endpoint, **signed with HMAC**, with a **stable event id** reused across
      retries; a rolled-back completion emits **no** webhook (outbox).
- [ ] A receiver **verifies the signature** (raw bytes, constant-time), rejects
      a **replayed/stale** request, acks fast, and **dedupes** a retried
      delivery so the effect happens once.
- [ ] The uploader sees **live progress** for their file over SSE/WebSocket,
      ending in a terminal done/failed state.
- [ ] Killing a real-time client (cleanly or by vanishing) leaves **zero leaked
      connections** — prove it with a live connection/stream count that returns
      to zero.
- [ ] A **completion email** arrives (in MailHog) with both parts, a working
      presigned-download CTA, and is **not duplicated** if the send task retries.
- [ ] Nothing slow runs inside a request handler: uploads, processing, webhook
      delivery, and email all happen off the request path.

### Stretch goals (optional)

- Run the service as **two web processes** and prove real-time progress and
  chat/broadcast work across them via the pub/sub backplane.
- Add a **scheduled cleanup job (module 03)** that deletes orphaned/expired
  uploads and stale result objects, safe to run on replicated schedulers
  (single-instance + time-window lock).
- Add **task prioritization (module 02)**: process paid-tier uploads on a
  `high` queue ahead of free-tier on a `low` queue.
- Give partners a **webhook delivery dashboard** with per-delivery status and a
  manual **replay** action.
- Support **resumable multipart** uploads and **Range** downloads for very
  large files.

### Hints (design, not code)

<details>
<summary>How the five pieces connect without tangling</summary>

Let the **object key** be the spine of the whole flow: the upload produces it,
the pipeline is keyed by it, the webhook payload and the email both reference
it, and the real-time channel is subscribed per-key (or per-user). Every task
takes the key, not bytes ("pass IDs, not objects," module 00). That single
discipline keeps messages small and every stage reading fresh state from
storage.

</details>

<details>
<summary>Where each reliability property has to live</summary>

Idempotency belongs at *every* side-effecting boundary, each with its own
stable key: pipeline output keyed by object key; webhook dedup keyed by event
id; email keyed by (file, "ready"). Retries+backoff wrap every outbound/slow
call (processing steps, webhook delivery, email send) and must distinguish
transient from permanent. Connection cleanup lives in the real-time layer's
`finally`/generator-cancellation. Atomicity (outbox) lives at the moment you
mark processing "done" and emit the event. If you find yourself adding a guard
in a request handler, it's probably in the wrong place — push it to the task.

</details>

<details>
<summary>Choosing the real-time transport</summary>

The uploader only *listens* to progress for their file — they don't send
anything over the channel — so SSE is the simpler, more robust choice (plain
HTTP, automatic reconnection, no connection-manager bookkeeping). Pick
WebSocket only if you add a genuinely bidirectional feature (e.g. the user can
cancel the job over the same channel). Either way, prove the no-leak property
with a count that returns to zero.

</details>

<details>
<summary>Proving the hard parts actually work</summary>

Don't just build it — demonstrate the failure modes are handled: force a
transient error in a pipeline step and watch it retry then succeed; force a
permanent error and watch it fail without retrying; replay a captured signed
webhook and confirm one effect; send the same event id twice and confirm one
effect; kill real-time clients and watch the count return to zero; roll back a
completion and confirm no webhook fired; retry the email send and confirm one
email. These demonstrations *are* the capstone — a happy-path demo proves
almost nothing this track cared about.

</details>

## Further reading & sources

- [Celery: Canvas — Designing Work-flows](https://docs.celeryq.dev/en/stable/userguide/canvas.html) - composing the processing pipeline as a chain with retries and idempotency.
- [microservices.io: Transactional Outbox pattern](https://microservices.io/patterns/data/transactional-outbox.html) - emitting the `file.processed` webhook atomically with the completion state.
- [Stripe: Verify webhook signatures](https://docs.stripe.com/webhooks/signatures) - the HMAC + timestamp receiver checks the capstone's receiver must implement.
- [AWS: Sharing objects with presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html) - direct-to-storage uploads/downloads that keep the API out of the byte path.
- [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) - the real-time progress channel and its automatic reconnection.
- [Redis: Pub/Sub](https://redis.io/docs/latest/develop/interact/pubsub/) - the multi-process backplane for delivering progress regardless of which process the client hit.

## Next

[../../07-search-with-elasticsearch/README.md](../../07-search-with-elasticsearch/README.md)
— you can now move slow work off the request path, coordinate it reliably, and
push results back through webhooks, real-time connections, and email. The next
track turns to a different hard problem: making large amounts of data
*searchable* — indexing, relevance-ranked full-text queries, and operating
Elasticsearch/Kibana.
