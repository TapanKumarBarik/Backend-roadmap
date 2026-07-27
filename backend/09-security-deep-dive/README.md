# 09 - Security Deep Dive

This track is about defending a backend against the attacks that break
otherwise-correct systems. Track 03 taught you to prove *who* a caller is and
decide *what* they may do; this track assumes that auth is solid and asks the
harder question — **how does an attacker get in anyway?** They attack the code
*around* the auth: the query that trusts a URL parameter, the template that
echoes a comment unescaped, the endpoint that fetches an attacker's URL, the
login with no rate limit, the secret hardcoded in source. You'll work through
the OWASP Top 10 as a *way of thinking* (not a checklist), exploit and then fix
each major attack class yourself, implement real rate limiting, manage secrets
properly, and apply the browser-enforced hardening every app should ship with —
all secure-by-design, all in Python/FastAPI.

## How this track works

- It assumes you finished **[03-authentication-and-authorization](../03-authentication-and-authorization/README.md)**:
  you're comfortable with sessions, JWTs (and key ids), API keys, MFA, RBAC/the
  centralized permission layer, constant-time comparison, and hardened cookies
  (`HttpOnly`/`Secure`/`SameSite`). This track builds directly on that — it does
  *not* re-teach auth; it defends everything around it, and reaches back to
  specific track-03 modules by name.
- Every module builds only on concepts from earlier modules in this track plus
  the track-03 knowledge you already have — no forward references. Module 00
  installs the trust-boundary lens that every later module applies.
- Each module README has the same shape: why it matters, concepts, a command
  reference with real Python/FastAPI (parameterized queries, escaping/CSP
  middleware, SSRF-safe fetchers, Redis rate limiters, `SecretStr` config,
  security-header middleware), progressive hands-on exercises (do them —
  including a "diagnose and fix" scenario each), an independent challenge with no
  code, common mistakes, and a checkpoint quiz. Two **cumulative reviews** (after
  modules 02 and 05) mix questions from everything so far, closed-book.
- The exercises grow one deliberately-attackable FastAPI project (`sec-track`) —
  ideally the `auth-track` you built in track 03 — so you're exploiting and
  hardening a real system with real auth, not toy snippets. The capstone hardens
  it end to end. Use Python 3.11+ and Redis in Docker, same as the rest of the
  curriculum.
- Libraries used: `fastapi`, `sqlalchemy` (parameterized queries/ORM), `nh3`
  (HTML sanitization), `httpx` + `ipaddress` (SSRF-safe fetching), `redis` +
  `slowapi` (rate limiting), `pydantic-settings` (`SecretStr` config),
  `pip-audit` / `bandit` / `gitleaks` (dependency + code + secret scanning).

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [The OWASP Top 10 as a way of thinking](00-owasp-top-10-overview/README.md) | Use trust boundaries and the attacker mindset to reason about the Top 10 as a model, not a checklist; threat-model your own app | 45-60 min |
| 01 | [Injection attacks](01-injection-attacks/README.md) | Exploit and then kill SQL, command, and NoSQL injection with parameterized queries, argv lists, typed input, and identifier allowlists | 75-90 min |
| 02 | [XSS and CSRF](02-xss-and-csrf/README.md) | Defend against stored/reflected/DOM XSS (escaping, sanitization, CSP) and CSRF (`SameSite`, synchronizer tokens), and reason about their tradeoff | 75-100 min |
| 03 | [SSRF and deserialization attacks](03-ssrf-and-deserialization-attacks/README.md) | Stop server-side request forgery (allowlist/resolve-validate) and insecure deserialization (never `pickle` untrusted data; JSON/`safe_load`) | 75-90 min |
| 04 | [Rate limiting and abuse prevention](04-rate-limiting-and-abuse-prevention/README.md) | Implement token-bucket and sliding-window limiters on Redis — atomic, shared, correctly keyed — to stop brute force, stuffing, and scraping | 75-100 min |
| 05 | [Secrets management](05-secrets-management/README.md) | Keep secrets out of code, logs, and git history; use env/vault-backed config, rotate with zero downtime, and scope to least privilege | 60-90 min |
| 06 | [Security headers and hardening](06-security-headers-and-hardening/README.md) | Ship HSTS/CSP/`nosniff`/`X-Frame-Options`/secure cookies via middleware, scan dependencies for CVEs, and run security-focused code review | 60-90 min |
| 07 | [Capstone project](07-capstone-project/README.md) | Take a deliberately vulnerable FastAPI app and harden it end to end against every attack class in the track — secure-by-design, defended, demonstrated | 4-6 hrs |

Start here → [00-owasp-top-10-overview/README.md](00-owasp-top-10-overview/README.md)

Back to the master index: [../README.md](../README.md)

---

Once you've completed this track, the next one is
**[10-distributed-systems-patterns](../10-distributed-systems-patterns/README.md)**
— a shift from securing a single backend to coordinating *systems* of them: CAP-
theorem tradeoffs, idempotency and distributed locking, and the saga/CQRS/event-
sourcing patterns that keep many services correct together.
