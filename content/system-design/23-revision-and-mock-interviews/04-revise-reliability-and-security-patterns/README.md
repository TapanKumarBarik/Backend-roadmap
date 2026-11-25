# Revise Reliability and Security Patterns: Breakers, DR, RTO/RPO, OAuth

> **Prerequisites:** [Previous lesson: Revise Caching, Messaging and Consistency: Outbox, Sagas, Idempotency](../03-revise-caching-messaging-and-consistency/README.md).
> **Estimated Reading Time:** 12–15 minutes
> **Target Audience:** Candidates revising circuit breakers, retries, disaster recovery and the security basics interviewers expect.

> [!NOTE]
> **In one line:** Reliability is **designing for failure you know will happen**; security is **making the failure of one control not the failure of the system**.

> [!TIP]
> **The Golden Rule:** Bound every wait, cap every retry, isolate every failure, and give every credential the least power it needs.

---

## 1. Resilience patterns

| Pattern | What it does | Detail that matters |
| :--- | :--- | :--- |
| Timeout | Stops waiting for a slow dependency | Set below the caller's own deadline; propagate deadlines |
| Retry with backoff and jitter | Recovers from transient errors | Cap attempts, retry only idempotent calls, use a retry budget |
| Circuit breaker | Stops calling an unhealthy dependency | Closed, open, half-open; fail fast or fall back |
| Bulkhead | Isolates resource pools | One slow dependency cannot use all threads |
| Load shedding | Rejects excess work early | Protects the work you can do |
| Rate limiting | Caps per-client use | Fairness and abuse control |
| Graceful degradation | Serve less, not nothing | Cached or default data when a service is down |

Retries multiply load during an outage: three retries across three layers is 27 times the traffic. A **retry budget** (for example, retries may add at most 10% extra requests) prevents retry storms.

---

## 2. Disaster recovery: RTO and RPO

- **RPO (recovery point objective)**: how much data you can afford to lose, measured in time. RPO of 5 minutes means backups or replication no more than 5 minutes behind.
- **RTO (recovery time objective)**: how long you can be down. RTO of 1 hour means you must be serving again within an hour.

| Strategy | RPO | RTO | Cost |
| :--- | :--- | :--- | :--- |
| Backup and restore | Hours | Hours to a day | Lowest |
| Pilot light (minimal copy running) | Minutes | Tens of minutes | Low |
| Warm standby (scaled-down copy) | Seconds to minutes | Minutes | Medium |
| Active-active multi-region | Near zero | Near zero | Highest, hardest data problem |

Untested backups are not backups. Rehearse failover, and keep failover steps automated and documented.

---

## 3. Security basics for interviews

- **Authentication** proves who you are; **authorisation** decides what you may do. Keep them separate.
- **OAuth 2.0** delegates access: the user authorises a client to call an API on their behalf and the client receives an **access token** (short lived) and optionally a **refresh token**. Use the **authorization code flow with PKCE** for browsers and mobile apps. **OpenID Connect** adds an identity layer (the ID token).
- **JWTs** are signed tokens verified locally without a database call; keep them short-lived and remember they cannot be revoked easily before expiry.
- **Encrypt in transit (TLS) and at rest.** Manage keys in a KMS and rotate them.
- **Least privilege** for services and humans; **secrets** in a vault, never in code or images.
- **Input validation**, parameterised queries (against injection), output encoding (against XSS), CSRF protection, and rate limiting on login.
- **Defence in depth**: network segmentation, WAF, audit logs, and monitoring so a single failure is not the whole story.

---

## 4. Observability in one page

- **Metrics**: numbers over time (rate, errors, duration). **Logs**: events with context. **Traces**: one request's path across services, tied by a trace id.
- Alert on **symptoms** users feel (error rate, latency percentiles), not on every cause.
- Define **SLIs** (what you measure), **SLOs** (the target) and an **error budget** (what you may spend on change and risk). A burned budget slows feature releases in favour of reliability.

---

## A circuit breaker state machine

After three failures the breaker opens and fails fast; after a cooldown it lets one trial request through.

```python
class Breaker:
    def __init__(self, threshold=3, cooldown=10):
        self.threshold, self.cooldown = threshold, cooldown
        self.failures, self.opened_at, self.state = 0, None, "closed"

    def call(self, fn, now):
        if self.state == "open":
            if now - self.opened_at < self.cooldown:
                return "fast-fail"
            self.state = "half-open"
        try:
            result = fn()
        except Exception:
            self.failures += 1
            if self.state == "half-open" or self.failures >= self.threshold:
                self.state, self.opened_at = "open", now
            return "error"
        self.failures, self.state = 0, "closed"
        return result

def bad(): raise RuntimeError("down")
def good(): return "ok"

b = Breaker()
print([b.call(bad, t) for t in range(5)])
print(b.call(good, 5), b.state)
print(b.call(good, 20), b.state)
```

Output (produced by running this exact code):

```text
['error', 'error', 'error', 'fast-fail', 'fast-fail']
fast-fail open
ok closed
```

Three errors open the breaker, the next calls fail fast without touching the dependency, a call during the cooldown is still rejected, and after the cooldown a successful trial closes it again.

---

## Common Mistakes

- Retrying without backoff, jitter or a cap.
- Retrying non-idempotent operations.
- Calling a failing dependency until threads run out (no breaker or bulkhead).
- Backups that have never been restored.
- Putting secrets in code, or long-lived tokens that cannot be revoked.

---

## Practice Questions

<details>
<summary><strong>Q1: How do you prevent a retry storm?</strong></summary>

Exponential backoff with jitter, a small attempt cap, retries only for idempotent calls, a retry budget, and retrying at one layer only.

</details>

<details>
<summary><strong>Q2: Explain RTO and RPO.</strong></summary>

RPO is how much data loss is acceptable (time of data), RTO is how long recovery may take. They set the DR strategy and cost.

</details>

<details>
<summary><strong>Q3: What does a circuit breaker do?</strong></summary>

It stops calling a failing dependency after a threshold, fails fast or falls back, and periodically trials the dependency to see if it recovered.

</details>

<details>
<summary><strong>Q4: OAuth versus OpenID Connect?</strong></summary>

OAuth 2.0 authorises access to resources; OpenID Connect builds on it to authenticate users and return their identity.

</details>

<details>
<summary><strong>Q5: How do you revoke a JWT?</strong></summary>

Use short lifetimes plus refresh tokens, and keep a denylist or token version check for urgent revocation, accepting the extra lookup.

</details>

<details>
<summary><strong>Q6: What are SLIs, SLOs and error budgets?</strong></summary>

SLIs are measurements, SLOs are targets for them, and the error budget is the allowed unreliability; spending it fast triggers a focus on reliability.

</details>

---

## One-Page Cheat Sheet

| Topic | Remember |
| :--- | :--- |
| Resilience | Timeout, backoff plus jitter, breaker, bulkhead, shed load, degrade |
| Retries | Cap, idempotent only, budget, one layer |
| DR | RPO = data loss, RTO = downtime; backup, pilot light, warm, active-active |
| OAuth | Auth code + PKCE; access token short, refresh longer |
| Secrets | Vault, rotation, least privilege |
| Observability | Metrics, logs, traces; SLO and error budget |

---

## Further Reading

- Google SRE book, chapters on handling overload, addressing cascading failures and embracing risk.
- OWASP Cheat Sheet Series: authentication, session management and OAuth.

---

## Next

Continue with [Revise GenAI System Design: RAG, Evaluation, Guardrails and Cost](../05-revise-genai-system-design/README.md).
