# 06 - Background Processing and Realtime

This track is about everything that shouldn't happen *inside* the request-
response cycle — and how systems talk to each other and to users after the
response has already gone out. Slow work (sending email, processing files,
calling third-party APIs), work on a schedule (backups, cleanups, syncs),
work triggered by other systems (webhooks), and live communication with the
browser (WebSockets, SSE, pub/sub) all share one theme: the request handler
does the fast part and returns, while the real work happens somewhere else,
reliably, and reports back.

## How this track works

- It assumes you've finished **track 02 (API Layer and Request Handling)** —
  you're comfortable with FastAPI, request handlers, middleware, and the
  `multipart/form-data`/`UploadFile` machinery — and **track 05 (Caching and
  Performance)**, whose Redis and concurrency-vs-parallelism material this
  track leans on constantly (Redis is the broker, result backend, pub/sub bus,
  lock store, and rate-limit token bucket here).
- Every module builds on the ones before it. The reliability disciplines
  established early — pass IDs not objects, retries with backoff, idempotency,
  the transactional outbox, connection cleanup — recur in every later module
  and converge in the capstone. Go in order.
- Each module README has the same shape: why it matters, concepts, a command
  reference with real Python (Celery tasks, FastAPI WebSocket/SSE handlers,
  HMAC signature verification, boto3/presigned URLs), progressive hands-on
  exercises (do them — including a "diagnose and fix" scenario each), an
  independent challenge with no code, common mistakes, and a checkpoint quiz.
  Every third or fourth module also carries a closed-book cumulative review.
- All exercises run locally against Redis, RabbitMQ, Kafka, MinIO, and
  MailHog in Docker, plus a tunnel (ngrok/cloudflared) for the webhook
  module — no cloud account required.

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [Task queues fundamentals](00-task-queues-fundamentals/README.md) | Move slow work off the request path with a producer/broker/worker Celery setup on Redis | 60-90 min |
| 01 | [Task dependencies and groups](01-task-dependencies-and-groups/README.md) | Chain, group, and chord tasks into pipelines where output feeds input and work fans out | 60-90 min |
| 02 | [Retries, prioritization, and rate limiting](02-retries-prioritization-and-rate-limiting-in-queues/README.md) | Retry with backoff, design idempotent tasks, prioritize queues, and rate-limit outbound calls | 75-100 min |
| 03 | [Scheduling recurring jobs](03-scheduling-recurring-jobs/README.md) | Run cron-style jobs with Celery Beat/APScheduler and stop replicated schedulers double-firing | 60-90 min |
| 04 | [Transactional emails](04-transactional-emails/README.md) | Build, personalize, and reliably send transactional email from a task, and reason about deliverability | 60-75 min |
| 05 | [Webhooks fundamentals](05-webhooks-fundamentals/README.md) | Design and deliver webhooks as the sender: payloads, retries, and the transactional outbox | 60-90 min |
| 06 | [Webhooks security and reliability](06-webhooks-security-and-reliability/README.md) | Receive webhooks securely: HMAC verification, replay defense, ack-fast, and idempotent receivers | 75-100 min |
| 07 | [WebSockets and Server-Sent Events](07-websockets-and-server-sent-events/README.md) | Push to the browser in real time, broadcast to many clients, and avoid the connection leak | 75-100 min |
| 08 | [Pub/Sub architecture](08-pub-sub-architecture/README.md) | Decouple with Redis Pub/Sub, scale WebSockets across processes, and know pub/sub vs. a durable queue | 60-90 min |
| 09 | [Message brokers: RabbitMQ](09-message-brokers-rabbitmq/README.md) | Route messages with exchanges (direct/topic/fanout), durable acknowledgment, and dead-letter queues | 75-100 min |
| 10 | [Message brokers: Kafka](10-message-brokers-kafka/README.md) | Model events as a durable, replayable log: topics, partitions, offsets, and consumer groups | 75-100 min |
| 11 | [Object storage and large files](11-object-storage-and-large-files/README.md) | Handle large uploads/downloads with streaming, object storage, and presigned URLs | 60-90 min |
| 12 | [Capstone project](12-capstone-project/README.md) | Build an async file-processing service tying together queues, webhooks, real-time, and email | 4-6 hrs |

Start here → [00-task-queues-fundamentals/README.md](00-task-queues-fundamentals/README.md)

Back to the master index: [../README.md](../README.md)

---

Once you've completed this track, the next one is
**07-search-with-elasticsearch** — a shift from *moving and coordinating* data
to *making it searchable*: indexing, relevance-ranked full-text queries, and
operating Elasticsearch and Kibana.
