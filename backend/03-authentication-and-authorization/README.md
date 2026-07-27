# 03 - Authentication and Authorization

This track teaches how to prove **who** a caller is (authentication) and decide
**what** they're allowed to do (authorization) — the two questions every real
backend has to answer the moment more than one person uses it. It builds
directly on the API you designed in track 02: the validated, middleware-chained,
RESTful FastAPI service with clean handler/service layering. Here you add real
auth on top of it — sessions, JWTs, OAuth2/OIDC, API keys, MFA, and RBAC — and,
just as importantly, learn to avoid the security holes that make "working" auth
code dangerous.

## How this track works

- It assumes you finished **[02-api-layer-and-request-handling](../02-api-layer-and-request-handling/README.md)**:
  you're comfortable with Pydantic validation, middleware, dependency injection
  (`Depends`), request context, and the handler → service → repository layering.
  Auth here is built as dependencies and middleware on exactly that foundation.
- Every module builds only on concepts from earlier modules in this track plus
  the track-02 knowledge you already have — no forward references.
- Each module README has the same shape: why it matters, concepts, a code
  reference table, hands-on exercises (do them — don't just read), an
  independent challenge with no code given, common mistakes, and a checkpoint
  quiz. Two **cumulative reviews** (after modules 02 and 05) mix questions from
  everything so far, closed-book.
- Go in order. The material is layered: sessions and JWTs are two answers to one
  question posed in module 00; OAuth2 (03) reuses the JWT from 02; MFA and
  password security (05) underpin every "verify the password" step; the
  hardening in 07 seals the seams of everything before it; and the capstone
  integrates all of it.
- All exercises grow one FastAPI project (`auth-track`) module over module, so
  by the capstone you're hardening a system you built yourself. Use Python 3.11+
  in your WSL2 environment, same as the rest of the curriculum.
- Libraries used: `fastapi`, `passlib[argon2]` / `argon2-cffi` for password
  hashing, `pyjwt` (or `python-jose`) for JWTs, `pyotp` for TOTP, `authlib` for
  OAuth2/OIDC, `redis` for shared session/rate-limit state.

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [Auth fundamentals: stateful vs stateless](00-auth-fundamentals-stateful-vs-stateless/README.md) | Distinguish authentication from authorization and stateful (session) from stateless (token) auth; use HTTP Basic and know its limits | 45-60 min |
| 01 | [Sessions and cookies](01-sessions-and-cookies/README.md) | Build server-side sessions with a shared store, hardened cookies (`HttpOnly`/`Secure`/`SameSite`), and session-fixation defense | 60-90 min |
| 02 | [JWT deep dive](02-jwt-deep-dive/README.md) | Issue and verify JWTs safely (HS256 vs RS256), use access + refresh tokens with rotation, and handle the revocation problem | 60-90 min |
| 03 | [OAuth2 and OIDC](03-oauth2-and-oidc/README.md) | Implement "Login with X" end to end — grant types, PKCE, `state`, and the ID token OIDC adds on top | 75-90 min |
| 04 | [API keys and service-to-service auth](04-api-keys-and-service-to-service-auth/README.md) | Issue/store/scope API keys correctly, choose keys vs OAuth2/JWT, and use mutual TLS for service identity | 60-75 min |
| 05 | [MFA and password security](05-mfa-and-password-security/README.md) | Store passwords with salted argon2/bcrypt, add TOTP MFA (and understand WebAuthn/passkeys), and avoid the classic hashing failures | 75-90 min |
| 06 | [Authorization models](06-authorization-models/README.md) | Choose and implement RBAC, ABAC, or ReBAC, and build a centralized permission-check layer in FastAPI that stops IDOR | 75-90 min |
| 07 | [Securing auth in practice](07-securing-auth-in-practice/README.md) | Defend auth against CSRF/XSS/MITM, timing/enumeration, and brute force; add rate limiting, lockout, and audit logging | 90 min |
| 08 | [Capstone project](08-capstone-project/README.md) | Build a full service with dual session+JWT auth, three-tier RBAC, TOTP MFA, hardened cookies, rate limiting/lockout, and audit logging | 4-6 hrs |

Start here → [00-auth-fundamentals-stateful-vs-stateless/README.md](00-auth-fundamentals-stateful-vs-stateless/README.md)

Back to the master index: [../README.md](../README.md)

---

Once you've completed this track, the next one is
**[04-databases-and-data-layer](../04-databases-and-data-layer/README.md)** —
where all the users, sessions, token families, roles, and audit records you've
been keeping in memory finally get a real, persistent home, with correct
schemas, transactions, and an ORM. Track **09-security-deep-dive** later builds
on this track to cover OWASP-class attacks and secure-by-design in full.
