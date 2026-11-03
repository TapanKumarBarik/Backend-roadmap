# Content to review before it is trusted

The 2.0 quizzes, exercises, interview sets and design challenges were drafted from the lessons by writers who could not run anything and who said, for
each, what they were least sure of. A person who knows the subject should read these before the content is relied on. The files are in
`content/practice/` and `content/design-lab/`; an admin can fix one in the browser (Admin, Practice, "Edit the content") or in git.

Nothing below is known to be wrong. It is where the facts rest on something other than the lesson text, on arithmetic the writer did, or on a
judgement call about which answer is "the" answer.

## Quizzes tied to a lesson that only partly covers them

- `tcp-ip-dns-ports-and-nat`: anchored on the TCP/UDP/ports lesson; the DNS, subnetting and NAT questions come from sibling lessons.
- `load-balancing-and-reverse-proxies`: questions 6 and 7 (reverse-proxy benefits, `X-Forwarded-For`) come from the nginx lesson.
- `tls-and-https-basics`: covers TLS and HTTPS only; there was no API-security lesson to draw on.
- `linux-permissions-streams-and-processes`: redirection, pipes and signals come from sibling lessons.
- `docker-images-containers-and-volumes`, `kubernetes-pods-probes-and-services`: wider than the one lesson each is tied to (volumes, networking, deployments, services).
- `system-design-availability-latency-and-spof`: tied to `10-availability`, but most system-design lessons are still stubs, so the Little's Law, p99,
  single-point-of-failure and Amdahl's Law questions rest on standard engineering knowledge, not on lesson text.
- `rag-fundamentals`, `prompting-and-tool-calling`: tied to the nearest lesson with real text; the HNSW and ReAct lessons are placeholders, so those topics are not covered.
- `kv-cache-and-gpu-memory`: tied to the memory-requirements lesson (there is no Python/FastAPI lesson to write the fifth quiz from).

## Specific statements to check

- **Networking:** the `/29` question (`10.0.5.40/29` spans .40 to .47; the broadcast address is not offered as an option).
- **TLS:** an observer still sees the SNI hostname "in a typical setup" (Encrypted Client Hello exists but is not widely deployed).
- **Load balancing:** an intermittent 502 means look at the balancer-to-backend hop first (a 502 can have other causes).
- **HTTP:** a logged-in non-admin gets 403 (some APIs answer 404 to hide that a resource exists); cancelling an order is `PATCH /orders/42`, with
  `POST /orders/42/cancellation` deliberately left out so two answers are not both defensible.
- **Linux:** "write and execute on the directory" is what deleting a file needs; the sticky bit is mentioned in the explanation.
- **Transactions:** the second updater blocks and then fails with a serialization error when the first commits (from the lesson's exercise); an atomic
  `UPDATE balance = balance + 10` counted as a valid fix (the lesson mentions "locking or atomic SQL" only briefly).
- **Replication and sharding:** "one shard per month" as a date-range example is the writer's own.
- **Caching:** `KEYS *` blocks Redis (well established, not in the lesson text); the generational-key trick is the lesson's.
- **CAP and consistency:** which quorum sizes guarantee that a read overlaps the latest write (N=3, W=2, R=2) is worded around overlap only, since the lesson
  says "W + R > N gives strong-ish consistency"; "partition tolerance is not optional" follows the lesson but is argued about.
- **System design arithmetic:** 99.9% is about 8.76 hours of downtime a year; two 99.9% components in series give 0.998; two independent 99% instances in
  parallel give 99.99%; 5,000 requests/s at 50 ms is 250 in flight; availability is MTBF/(MTBF+MTTR).
- **Capacity arithmetic (checked twice by the writer):** 50M x 20 / 10^5 = 10k per second on average, 30k at 3x peak; 10M x 2 KB x 365 x 3 is about 21.9 TB; 20,000 x
  50 KB is 1 GB/s, about 8 Gbps; 90,000 / 15,000 = 6, plus 2 for N+2 = 8; 20 TB / 256 GB is about 78, so about 80 nodes.
- **Azure:** a private endpoint versus a service endpoint (check the wording against current Azure docs); `--use-remote-gateways` is not needed for hub-firewall
  forwarding (the question most worth checking).
- **Kubernetes:** exceeding a memory limit gives OOMKilled, exceeding a CPU limit is throttled, the scheduler uses requests, not limits.
- **GenAI:** the KV-cache arithmetic (2 x 32 layers x 8 KV heads x 128 head dim x 2 bytes = 128 KiB per token; 512 MiB at 4,096 tokens) is the writer's own, from the
  lesson's formula; cosine 0.8 and an L2 distance of about 0.63 for unit vectors is from the lesson; the "output checks are still needed" framing in the RAG quiz is a
  synthesis of two lessons; the latency figures are an illustrative table; the claim that `max_tool_calls` limits only built-in tools is taken from the OpenAI spec as
  cited in the lesson (checked 2026-10-26) and may have changed.

## Design challenges, exercises and interview sets

- `food-delivery` is tied to the ride-sharing lesson (no food-delivery lesson exists); `ecommerce-platform` to the payment-processing lesson.
- The Mermaid diagrams in the four new references were never drawn by the writer; `npm run check:diagrams` now draws them (all render).
- The capacity numbers in the feed and e-commerce challenges are assumptions used to show the reasoning, not measurements (about 800 GB of feed cache from
  500 entries x 16 B x 100M users; an inventory row-lock throughput of "a few hundred to a couple of thousand per second per row", flagged in the text as
  something to measure).
- PostgreSQL facts in the interview answers: read committed is the default; repeatable read is snapshot isolation; serializable can abort a transaction;
  `FOR UPDATE SKIP LOCKED` behaves as described. Kubernetes Secrets are only base64-encoded unless encryption at rest is enabled. RFC 9457 "problem details";
  412 on an `If-Match` failure; 422 versus 400 for validation errors.
- The `debug-slow-query-with-explain` exercise's plan costs and timings are plausible but synthetic (20M rows, 96 matches), never run on a real database.
- The zero-downtime migration exercise does not state the lock behaviour of `ADD COLUMN` for particular PostgreSQL versions, only the expand/contract steps.
