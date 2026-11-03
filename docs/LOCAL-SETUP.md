# Running the app locally

The site is a React frontend (`webapp/`) plus an API (`api/`, a Hono app
served by the Cloudflare Pages Function in `functions/api/[[path]].js`) backed
by Cloudflare D1. The frontend alone renders the curriculum; everything
account-shaped — progress sync, comments, notes, bookmarks, the admin
dashboard — needs the API running too.

Locally the API runs under `wrangler pages dev` against a **local** SQLite copy
of D1 (in `.wrangler/state/`), never the production database.

## One-time setup

### 1. Dependencies

```bash
npm install                    # the whole repo: the app, the API and the tools
```

### 2. Build the site

```bash
npm run build
```

This assembles the whole site in `dist/` — the only build output; nothing
generated is written anywhere else. In order: the webapp bundle, the content
indexes (`docs-index.json`, `search-index.json`), the curriculum trees and
Cloudflare config, then a pre-rendered page per module plus `sitemap.xml`.
Re-run it after adding or renaming a module.

### 3. Local database

```bash
npm run db:migrate          # builds the schema from api/migrations/; run it again whenever a migration is added
```

### 4. `.dev.vars`

`wrangler pages dev` reads secrets from `.dev.vars` in the repo root. It is
**gitignored** and must stay that way. Copy the template and fill it in:

```bash
cp .dev.vars.example .dev.vars
```

> [!WARNING]
> Never deploy the repo root, and never copy `.dev.vars` anywhere under
> `dist/`. Deploys upload only `dist/`, and `scripts/build/copy-content.mjs` fails
> the build if anything secret-shaped is in it — `wrangler pages deploy` does
> **not** honor `.assetsignore`, and deploying the root once published this file.

## Running it

Two terminals, after `npm run build` (the API serves from `dist/`):

**Backend** (repo root):

```bash
npm run api
```

**Frontend**:

```bash
npm run dev                      # hot reload on port 4173, for working on the UI
```

Then open **<http://localhost:4173>**, or **<http://localhost:4173/#__admin>**
for the admin dashboard. Vite proxies `/api` to `http://localhost:8788`
([`webapp/vite.config.js`](../webapp/vite.config.js)).

The community's articles open there too (`/blog/`, `/blog/<slug>`: the dev server hands the app any address). What a search
engine or a link preview gets for them is made by Pages Functions, which run only under `npm run api`: after
`npm run build`, open <http://localhost:8788/blog/> to see the pages as the server draws them.

## Why the port matters

Use **4173** for the frontend. Google only redirects OAuth back to a URI
registered on the client, and `http://localhost:4173/api/auth/callback` is the
one registered for local development. `SITE_ORIGINS` in `.dev.vars` must
include `http://localhost:4173`.

On any other port you'll get `redirect_uri_mismatch` from Google, or a
`400 Sign-in link expired or invalid` from the callback — the `oauth_state`
cookie is host-and-port scoped. See
[`api/routes/auth.js`](../api/routes/auth.js).

## Signing in

`/api/manage/*` returns **401** until you sign in, and **403** if you're signed
in as someone who isn't an admin. Admin access is by email: the owner is
`ADMIN_EMAIL` in `wrangler.jsonc`, and anyone else is a row in the `admins`
table, managed from **Admin → People**.

## Working without the API

```bash
npm run dev
```

The dev server serves the curriculum from the repo and the indexes from
`dist/`, so run `npm run build` (or just `npm run index`) once
first. Progress tracking still works — it's IndexedDB-backed and only syncs once
you're signed in.

Everything account-shaped (Community, Feed, Books, Suggestions, notes, comments)
needs the API, so without it each of those shows an amber **"The server hit a
problem"** notice with a **Try again** button. That is expected here, not a bug.
`npm run dev` adds a line to that notice saying the API isn't running; real
visitors never see that line. If the module index is missing, the whole app shows
**"We couldn't load the curriculum"** with a reminder to run `npm run index`.

## Before you push

CI runs these:

```bash
npm run lint       # ESLint, no warnings allowed
npm run typecheck  # type checks the API, the scripts and the app's non-component code
npm test           # unit tests
npm run check      # every isAdmin() awaited; every API file parses; paths.json and images are valid
npm run build      # the full site build, as deployed
npm run check:bundle  # what a visitor downloads stays within the budgets in site.config.json (after the build)
```

CI also drives the built site in a real browser (`tests/e2e/`). To run those yourself, serve the build and point the tests at it:

```bash
npm run preview &  # serves dist/ on http://localhost:4180
npm run test:e2e   # needs Chrome, Edge or Chromium; set E2E_EXECUTABLE to use a particular one
```

How the pieces fit together, and where to change what: [ARCHITECTURE.md](ARCHITECTURE.md).

Pushing to `main` deploys via `.github/workflows/cloudflare-pages.yml`.

## Running the checks the way CI does (Linux, Node 22)

`npm run ci:linux` runs the deploy workflow's verify steps in a throw-away Docker container (Node 22, Chromium): the same checks, build and browser tests, on
Linux. It is where a test that depends on fonts, on how `localhost` resolves or on speed shows itself before CI does (it clones the repository, so commit
first). See [`TESTING_REPORT.md`](TESTING_REPORT.md).
