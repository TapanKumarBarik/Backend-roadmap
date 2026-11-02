# api/

The Hono application behind every `/api/*` request: sign-in, progress, notes, comments, the feed, community blogs,
books, suggestions, the workspace and the admin tools. It runs as a Cloudflare Pages Function on top of a D1
(SQLite) database. This folder is **not** the backend curriculum; that lives in [`../backend/`](../backend/).

```text
app.js               mounts every router under /api  (the entry the Pages Function calls)
routes/<area>.js     one router per area: auth, study, feed, comments, blogs, community, workspace, admin, content
lib/                 shared helpers: d1 access, session cookies, rate limiting, admin check, blob uploads,
                     comment paths (feed: / blog: prefixes), the statements that delete blog data
migrations/          the D1 schema, as numbered SQL files applied in order
tests/               API tests: the real app, on an in-memory SQLite database standing in for D1
types.d.ts           the bindings (the database, the secrets) a handler's `c.env` carries
```

How a request gets here: `functions/api/[[path]].js` (the only file Cloudflare Pages looks for) hands the
request to `app.js`. Nothing else in `functions/` is needed, which is why the code lives here.

## Rules worth knowing

- Every admin route must `await isAdmin(...)`. `npm run check` fails if one does not (`scripts/check/check-admin-guards.mjs`).
- A new route must ask for a sign-in unless it is deliberately public. `tests/access.test.js` calls **every**
  route without signing in and fails for any that answers; a public route goes in its `PUBLIC` list on purpose.
  Every `/api/manage/*` route must also refuse a signed-in visitor who is not an admin.
- Build a router with `createRouter()` from `lib/router.js`, not `new Hono()`: that is what makes `c.env.SESSION_SECRET`
  type-checked (`npm run typecheck`), so a misspelt secret is a build error instead of `undefined` at runtime.
- Repo and branch names come from [`../site.config.json`](../site.config.json), not from literals in a route.
- Secrets (session key, Google OAuth, storage tokens) are Cloudflare environment secrets, locally `.dev.vars`;
  see [`../docs/LOCAL-SETUP.md`](../docs/LOCAL-SETUP.md).

## Changing the database

The schema is the numbered files in `migrations/`, applied in order and each applied once. Cloudflare keeps a
`d1_migrations` table to remember which ones have run.

```bash
npm run db:new -- add_status_to_suggestions   # creates migrations/0003_add_status_to_suggestions.sql (the next free number)
npm run db:migrate                            # applies what is missing to your local database
npm run db:migrate:remote                     # applies what is missing to the real database (needs your Cloudflare login)
```

- **Never edit a migration that has been merged.** Production has already run it; add a new numbered file instead.
- **Make it additive.** New tables, and new columns that are nullable or have a default. The old code keeps running
  against the new schema while the new code deploys, so nothing it reads may disappear in the same step.
- **Apply it to production before the code that needs it ships** (`npm run db:migrate:remote`), then merge.
- `0001_initial.sql` is written with `IF NOT EXISTS` because the production database already held this schema before
  migrations existed.
- The tests catch a forgotten migration: they apply every file to an empty database and fail if the SQL in `routes/`
  or `lib/` names a table that no migration creates. A migration that was written but never applied to production
  is caught after the deploy instead: the smoke test calls `/api/blogs`, which reads the tables `0002` created.

## Tests

```bash
npm test          # all unit tests; the ones for the API are in api/tests/
```

`tests/helpers.js` gives a test a working `env` (`createEnv()`: a migrated in-memory database, the session secret)
and a way to be signed in (`signedInAs('someone@example.com')` returns a `cookie` header). A test then calls the
real app: `app.request('/api/bookmarks', { headers: { cookie } }, env)`. No server and no network are involved.
Node's built-in SQLite stands in for D1, which is why the tests need Node 22.13 or later.
