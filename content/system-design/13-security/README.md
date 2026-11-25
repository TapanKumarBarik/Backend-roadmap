# Track: Security

Authn vs authz, sessions, tokens, OAuth/OIDC, secrets, threat modeling, supply chain and the security questions that land in design rounds.

Part of **Phase 5** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLNdzHik9GD0I). Every lecture pairs a spoken walkthrough with a full 16-section written deep dive: architecture diagrams, mathematical models, 4-language production code tabs (`Go`, `TypeScript`, `Python`, `C#`), CLI verification workflows, 12 interview Q&As, and a one-page cheat sheet.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- Every lesson below is **Live** with full notes, diagrams, and multi-language code.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Authentication vs Authorization: Who You Are vs What You Can Do](01-authentication-vs-authorization/README.md) | Separate 401 identity verification from 403 permission checks and enforce fail-closed boundaries | **Live** |
| 02 | [Session-Based Authentication: Cookies, HttpOnly, SameSite & CSRF](02-session-based-authentication/README.md) | Configure `HttpOnly`, `Secure`, `SameSite`, and CSRF defenses with instant server-side revocation | **Live** |
| 03 | [JWT Authentication: Claims, RS256, JWKS & the Revocation Problem](03-jwt-authentication/README.md) | Verify asymmetric RS256/EdDSA JWTs via JWKS and solve stateless revocation with short TTLs | **Live** |
| 04 | [OAuth 2.0: Authorization Code + PKCE, Scopes & Client Credentials](04-oauth-2-0/README.md) | Implement Authorization Code + PKCE for users and Client Credentials for M2M services | **Live** |
| 05 | [OpenID Connect & SSO: ID Tokens, Discovery and SAML vs OIDC](05-openid-connect-sso/README.md) | Validate OIDC ID tokens (`nonce`, `aud`, `iss`) and compare OIDC vs SAML enterprise SSO | **Live** |
| 06 | [RBAC vs ABAC vs ReBAC: Permissions at Scale (Google Zanzibar)](06-rbac-vs-abac-vs-rebac/README.md) | Choose between role, attribute, and relationship-graph authorization models at scale | **Live** |
| 07 | [Service-to-Service Auth Without Static Secrets: mTLS, SPIFFE, Zero Trust](07-service-to-service-auth-without-static-secrets/README.md) | Replace long-lived API keys with SPIFFE/SPIRE workload identities and short-lived mTLS certs | **Live** |
| 08 | [Encryption in Transit: Why TLS Everywhere, Even Inside Your Network](08-encryption-in-transit/README.md) | Enforce TLS 1.3 and internal mTLS to stop east-west lateral movement and sniffing | **Live** |
| 09 | [Envelope Encryption Explained: Encryption at Rest, KMS, DEK & KEK](09-envelope-encryption-explained/README.md) | Protect data at rest with KMS-wrapped DEKs, AEAD (AES-GCM), and zero-downtime key rotation | **Live** |
| 10 | [Secrets Management: Vault, Dynamic Secrets & Rotation (Never in Git)](10-secrets-management/README.md) | Eliminate static secrets in Git/env vars using Vault dynamic leases and automated rotation | **Live** |
| 11 | [Hashing Passwords: Why Not SHA-256? Argon2, bcrypt, Salt & Pepper](11-hashing-passwords/README.md) | Hash passwords with memory-hard Argon2id, unique salts, and KMS-backed peppers | **Live** |
| 12 | [OWASP Top 10 Explained: Injection, Broken Access Control, SSRF & More](12-owasp-top-10-explained/README.md) | Mitigate SQLi, Broken Access Control, and SSRF with parameterized queries and allowlists | **Live** |
| 13 | [OWASP API Security Risks: BOLA, Mass Assignment & Data Exposure](13-owasp-api-security-risks/README.md) | Defend APIs against BOLA/IDOR, mass assignment, and excessive data exposure | **Live** |
| 14 | [Credential Stuffing Defence: Rate Limits, WAF, Bot Detection & MFA](14-credential-stuffing-defence/README.md) | Layer IP/account rate limits, breached-password checks, and phishing-resistant MFA | **Live** |
| 15 | [Least Privilege & Zero Trust: IAM, Segmentation, Just-in-Time Access](15-least-privilege-zero-trust/README.md) | Scope IAM policies, micro-segment networks, and enforce JIT privilege elevation | **Live** |
| 16 | [Threat Modeling with STRIDE: Find the Holes Before Launch](16-threat-modeling-with-stride/README.md) | Run structured STRIDE threat models over DFDs to catch design flaws before writing code | **Live** |
| 17 | [Audit Logging: Who Did What, When — Append-Only and Tamper-Evident](17-audit-logging/README.md) | Build immutable, hash-chained, WORM-backed audit logs for compliance and forensics | **Live** |
| 18 | ['Delete My Data' Across a Distributed System: GDPR + Crypto-Shredding](18-delete-my-data-across-a-distributed-system/README.md) | Fulfill GDPR erasure across DBs, caches, Kafka, and backups using crypto-shredding | **Live** |
| 19 | [Multi-Tenant Security: Never Leak Data Between Tenants (Postgres RLS)](19-multi-tenant-security/README.md) | Enforce defense-in-depth tenant isolation with Postgres Row-Level Security and JWT claims | **Live** |
| 20 | [Software Supply Chain Security: SBOMs, Signed Images, SLSA, cosign](20-software-supply-chain-security/README.md) | Lock down CI/CD artifacts with SBOMs, SLSA provenance, and `cosign` admission checks | **Live** |

Start here → [Authentication vs Authorization: Who You Are vs What You Can Do](01-authentication-vs-authorization/README.md)

Back to the course index: [../README.md](../README.md)
