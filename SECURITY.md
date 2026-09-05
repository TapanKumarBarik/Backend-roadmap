# Security

This is a personal project, not a company with a security team, but it does
handle real user accounts (Google OAuth), real user data (progress, notes,
comments), and an admin surface with commit access to this repository's
`main` branch. Please report responsibly.

## Reporting a vulnerability

**Do not open a public issue for a security finding.** Email
**tapankumarbarik7@gmail.com** instead, with:

- what you found and where (a file/endpoint, not just "the site")
- the impact as you understand it
- steps to reproduce, if you have them

You should get a response within a few days. This is a side project
maintained by one person, so "a few days" is a realistic expectation, not a
formal SLA.

## Scope

In scope:

- `api/` — the Azure Functions backend (auth, progress sync, comments,
  the admin endpoints, the content editor)
- `webapp/` — the React frontend
- The deployment configuration (`staticwebapp.config.json`, the GitHub
  Actions workflows)

Out of scope:

- The curriculum content itself (`backend/`, `learn/`, `lld/`, `genai/`) —
  factual or technical corrections there are a pull request, not a security
  report
- Third parties this app depends on (Google, Azure, GitHub) — report those
  to them directly

## What would actually matter here

Given what this app does, the findings worth flagging fastest are anything
that could:

- authenticate as another user, or forge/replay a session
- read or modify another user's progress, notes, or comments
- reach an admin-only endpoint without being an admin
- use the content editor's GitHub token to write to this repo without going
  through the app's own auth
- exfiltrate the Table Storage connection string, the session signing
  secret, or the Google OAuth client secret

## What's already been considered

Documented in code comments near the relevant logic, in case it saves you
time:

- Sessions are HMAC-signed, host-only cookies (`api/src/lib/session.js`) —
  not JWTs, not encrypted (the payload holds nothing sensitive).
- Admin access is an email allowlist with one hardcoded owner who cannot be
  revoked and cannot revoke themselves, specifically to prevent a lockout
  (`api/src/lib/adminAuth.js`). Every admin check must be `await`ed — an
  un-awaited call would silently grant admin to everyone, which is why
  `scripts/check-admin-guards.js` fails CI if one is missing.
- OAuth `redirect_uri` is derived from the request and checked against an
  allowlist, not trusted blindly from a client-supplied header
  (`api/src/functions/auth.js`).
