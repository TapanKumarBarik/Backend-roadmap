# Running the app locally

The site is a React frontend (`webapp/`) plus an API (`api-cf/`, a Hono app
served by the Cloudflare Pages Function in `functions/api/[[path]].js`) backed
by Cloudflare D1. The frontend alone renders the curriculum; everything
account-shaped — progress sync, comments, notes, bookmarks, the admin
dashboard — needs the API running too.

Locally the API runs under `wrangler pages dev` against a **local** SQLite copy
of D1 (in `.wrangler/state/`), never the production database.

## One-time setup

### 1. Dependencies

```bash
npm install                 # repo root: hono (bundled into the Pages Function)
cd webapp && npm install
```

### 2. Content indexes

`docs-index.json` and `search-index.json` are generated from the curriculum
markdown, not committed — see the note in `.gitignore` for why:

```bash
python3 scripts/gen-docs-index.py
python3 scripts/gen-search-index.py
```

Re-run these after adding or renaming a module. CI does this before every
deploy, so this only matters for your own clone.

### 3. Local database

```bash
npx wrangler d1 execute backend-roadmap-db --local --file=cloudflare/d1-schema.sql
```

### 4. `.dev.vars`

`wrangler pages dev` reads secrets from `.dev.vars` in the repo root. It is
**gitignored** and must stay that way. Copy the template and fill it in:

```bash
cp .dev.vars.example .dev.vars
```

> [!WARNING]
> Never deploy the repo root, and never copy `.dev.vars` anywhere under
> `dist/`. Deploys upload only what `scripts/stage-dist.cjs` allowlists —
> `wrangler pages deploy` does **not** honor `.assetsignore`, and deploying the
> root once published this file.

## Running it

Two terminals. The API serves from `dist/`, so build and stage once first:

```bash
cd webapp && npm run build && cd .. && node scripts/stage-dist.cjs
```

**Backend** (repo root):

```bash
npx wrangler pages dev --port 8788
```

**Frontend**:

```bash
cd webapp
npm run dev -- --port 4173        # hot reload, for working on the UI
```

Then open **<http://localhost:4173>**, or **<http://localhost:4173/#__admin>**
for the admin dashboard. Vite proxies `/api` to `http://localhost:8788`
([`webapp/vite.config.js`](webapp/vite.config.js)).

## Why the port matters

Use **4173** for the frontend. Google only redirects OAuth back to a URI
registered on the client, and `http://localhost:4173/api/auth/callback` is the
one registered for local development. `SITE_ORIGINS` in `.dev.vars` must
include `http://localhost:4173`.

On any other port you'll get `redirect_uri_mismatch` from Google, or a
`400 Sign-in link expired or invalid` from the callback — the `oauth_state`
cookie is host-and-port scoped. See
[`api-cf/routes/auth.js`](api-cf/routes/auth.js).

## Signing in

`/api/manage/*` returns **401** until you sign in, and **403** if you're signed
in as someone who isn't an admin. Admin access is by email: the owner is
`ADMIN_EMAIL` in `wrangler.jsonc`, and anyone else is a row in the `admins`
table, managed from **Admin → People**.

## Working without the API

```bash
cd webapp && npm run dev -- --port 4173
```

Progress tracking still works — it's IndexedDB-backed and only syncs once
you're signed in. Everything account-shaped fails its fetch and renders its
error state.

## Before you push

CI runs these:

```bash
node scripts/check-admin-guards.js    # every isAdmin() awaited; every API file parses
cd webapp && npm run build
```

Pushing to `main` deploys via `.github/workflows/cloudflare-pages.yml`.
