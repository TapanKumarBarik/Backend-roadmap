# api/

The Hono application behind every `/api/*` request: sign-in, progress, notes, comments, the feed, books,
suggestions, the workspace and the admin tools. It runs as a Cloudflare Pages Function on top of a D1
(SQLite) database. This folder is **not** the backend curriculum; that lives in [`../backend/`](../backend/).

```text
app.js               mounts every router under /api  (the entry the Pages Function calls)
routes/<area>.js     one router per area: auth, study, feed, comments, community, workspace, admin, content
lib/                 shared helpers: d1 access, session cookies, rate limiting, admin check, blob uploads
schema.sql           the D1 schema
```

How a request gets here: `functions/api/[[path]].js` (the only file Cloudflare Pages looks for) hands the
request to `app.js`. Nothing else in `functions/` is needed, which is why the code lives here.

Rules worth knowing:

- Every admin route must `await isAdmin(...)`. `npm run check` fails if one does not (`scripts/check/check-admin-guards.js`).
- Repo and branch names come from [`../site.config.json`](../site.config.json), not from literals in a route.
- Secrets (session key, Google OAuth, storage tokens) are Cloudflare environment secrets, locally `.dev.vars`;
  see [`../docs/LOCAL-SETUP.md`](../docs/LOCAL-SETUP.md).
