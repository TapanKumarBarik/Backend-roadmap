# Module 08: Capstone Project

## Why this matters

Every module in this track taught one piece in isolation: sessions, JWTs,
OAuth2/OIDC, API keys, MFA, password hashing, RBAC/ABAC/ReBAC, and the hardening
that keeps it all from falling over in production. Real auth systems are never
one piece — they're all of them, wired together, with the seams (module 07)
sealed. This capstone is the integration test: a single service that serves a
**browser client with session auth** *and* an **API client with JWT auth**,
enforces **RBAC across three permission tiers**, gates login on **TOTP MFA**,
locks down its **cookies**, **rate-limits and locks out** its login, and keeps a
**secret-free audit log** of everything.

There's no solution code here — that's the point. You have every technique you
need from modules 00-07; assembling them into one coherent, defensible system
without a recipe is exactly the skill that separates "I followed a tutorial"
from "I can build auth." Build it in the `auth-track` project you've grown all
track. Take your time; this is the real thing.

## The project

Build **AuthTrack**, a FastAPI service for a small document/orders application
with two front doors that share one identity and authorization core.

### Core requirements

**Dual authentication (modules 00, 01, 02)**
- A **browser flow** using server-side **sessions** with `HttpOnly`, `Secure`,
  `SameSite` cookies, backed by a shared store (Redis) so it survives restarts
  and multiple workers. Rotate the session id on login (fixation defense).
- An **API flow** using short-lived **JWT access tokens** plus revocable
  **refresh tokens with rotation** (and reuse detection). Pin the verify
  algorithm.
- Both flows resolve to the same `get_current_user` abstraction so the rest of
  the app doesn't care how the caller authenticated.

**MFA on login (module 05)**
- Passwords stored with **argon2id** (salted, adaptive). Login must be
  **constant-time against username enumeration** (dummy-hash path).
- **TOTP** second factor: enrollment with a provisioning URI/QR, verification
  with clock-skew tolerance, and **hashed, single-use recovery codes**. A
  correct password alone must not complete login when MFA is enabled.

**RBAC authorization, three tiers (module 06)**
- At least three roles — e.g. `viewer`, `editor`, `admin` — with **data-driven**
  permissions enforced through a single **centralized dependency** (deny by
  default), composed after authentication and working identically for
  session- and JWT-authenticated callers.
- A **resource-level ownership check** (the ReBAC seed) so editors act only on
  their own resources while admins override — and an explicit **IDOR
  regression test** proving a non-owner is denied.

**Hardening (module 07)**
- **CSRF** protection on the browser (cookie) flow: `SameSite` plus a CSRF
  token on state-changing requests.
- **Rate limiting** on login (per IP and per account) returning `429`/
  `Retry-After`, plus **backoff-style lockout** that is not itself a DoS or
  enumeration vector.
- **One generic message and status** across all login failure modes; TLS
  assumptions documented (`Secure` cookies, HSTS).
- **Constant-time comparison** everywhere a secret is checked (tokens, API
  keys, recovery codes).

**Audit logging (module 07)**
- A **secret-free** audit trail of every auth/authz event: login success/
  failure, logout, MFA challenge, token issue/refresh/revoke, permission
  denials (`403`), lockouts. Record subject, event, IP/user-agent, outcome —
  never passwords, full tokens, keys, or codes.

### Stretch goals (optional)

- **OAuth2/OIDC social login** (module 03): "Sign in with Google/GitHub" that
  bridges the provider identity into your *own* session/JWT.
- **API keys** (module 04) for third-party programmatic access, stored hashed,
  scoped, and revocable, with a `POST /token` that trades a key for a JWT.
- Swap hand-rolled RBAC for a **policy engine** (Casbin) or add an **ABAC**
  contextual rule (e.g. destructive actions only in business hours).

### Acceptance checklist

Your build is done when you can demonstrate all of the following:

- [ ] A browser user logs in (password → TOTP), receives a hardened session
      cookie, and can call protected endpoints; logout revokes the session
      **immediately** server-side.
- [ ] An API client logs in and receives an access + refresh token; the access
      token expires quickly; `/refresh` rotates the refresh token; a **reused**
      old refresh token triggers family revocation.
- [ ] The **same** protected endpoints work for both a session-authenticated
      browser call and a JWT-authenticated API call, via one `get_current_user`.
- [ ] Passwords are argon2id hashes; the login for a **nonexistent** username
      takes ~the same time as for a real username with a wrong password, and
      both return the **identical** generic response.
- [ ] MFA is enforced: a correct password without the TOTP code does **not**
      complete login; a recovery code works once and cannot be reused.
- [ ] The three roles produce a correct permission matrix; a viewer gets `403`
      (not `401`) on a write; an editor is denied on **another** user's resource
      (IDOR test passes); an admin overrides.
- [ ] A cross-site forged POST to a state-changing endpoint is **blocked**
      (SameSite + CSRF token); a JWT-only endpoint is unaffected by CSRF.
- [ ] Login is rate-limited (the N+1th rapid attempt returns `429` with
      `Retry-After`); repeated failures trigger backoff without revealing
      account existence.
- [ ] The audit log contains every auth event with subject/IP/outcome and, on
      inspection, contains **no** passwords, full tokens, API keys, or TOTP
      codes.
- [ ] `401` is used only for *unauthenticated* and `403` only for
      *authenticated-but-forbidden*, consistently.

### Hints

- Build the identity core first: `get_current_user` that accepts *either* a
  session cookie *or* a Bearer JWT, resolving both to the same `User`. Everything
  else (RBAC, audit, endpoints) hangs off that one abstraction — get it right and
  the two front doors become interchangeable.
- Do the login *ordering* deliberately: rate-limit → constant-time password
  verify (dummy-hash path) → MFA step → issue credential → audit. Each stage is a
  module you already built; the skill is sequencing them so no stage leaks
  information the next one depends on hiding.
- Keep authorization as **data** (a role→permission map, plus per-resource
  ownership), enforced in one dependency. If you find yourself writing
  `if role == "admin"` inside a handler, stop — that belongs in the centralized
  layer.
- Treat the audit log as append-only from day one and pass only ids/`jti`s/
  prefixes into it — retrofitting secret-scrubbing later is how secrets leak.
- Test the *negative* cases explicitly (wrong role, non-owner, reused refresh
  token, forged CSRF, rapid-fire login): a permission system is only as good as
  the denials you've proven.

## Further reading & sources

- [OWASP Application Security Verification Standard (ASVS)](https://owasp.org/www-project-application-security-verification-standard/) - a checklist to verify your finished auth system against, chapter by chapter.
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) - the end-to-end reference tying together password storage, MFA, and generic errors.
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) - the cookie/session hardening the browser flow must satisfy.
- [FastAPI Security documentation](https://fastapi.tiangolo.com/tutorial/security/) - the dependency/OAuth2 primitives you assemble the dual-auth core from.
- [OWASP Top 10](https://owasp.org/www-project-top-ten/) - the risk categories (Broken Access Control, Identification/Auth Failures) this capstone is designed to defend against.

## Next

[../../04-databases-and-data-layer/README.md](../../04-databases-and-data-layer/README.md)
— you can now authenticate and authorize real users and services. But every
session, token family, user, role, and audit record you built here has been
living in in-memory dicts or a single Redis instance. The next track is where
that data gets a real home: schema design, correct concurrent transactions,
using an ORM properly, and reasoning about replication and sharding — the
persistent, correct data layer your auth system (and everything else) actually
needs underneath it.
