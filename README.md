# Backend Roadmap

A hands-on curriculum for backend engineering, infrastructure, low-level design, and system design —
plus the progress-tracking app that serves it.

**Live site:** <https://backendroadmap.com/>

## What's in here

- `backend/`, `learn/`, `genai/`, `lld/` — the curriculum content itself, one markdown file per module.
  Each top-level directory's own `README.md` explains its own structure and conventions.
- `webapp/` — the React app that renders the curriculum: a searchable module tree, progress tracking
  (works signed-out via IndexedDB, syncs across devices once signed in with Google), bookmarks, private
  notes, comments, reactions, feed, workspace and an admin dashboard. Inside `webapp/src/`:
  `components/<feature>/` (one folder per screen or area), `hooks/`, and `lib/` (`markdown/` rendering,
  `curriculum/` tree and progress logic, `search/`, plus the API client `api.js`).
- `api/` — the API: a [Hono](https://hono.dev) app on Cloudflare Pages Functions backed by Cloudflare
  D1 — Google OAuth, progress sync, comments, notes, bookmarks, reactions, streaks, feed, and a
  GitHub-commit-based content editor. `api/routes/` holds the endpoints, `api/lib/` the shared helpers,
  `api/schema.sql` the database schema. Uploaded files live in Azure Blob Storage.
- `functions/api/[[path]].js` — the one-line Cloudflare Pages entry point that hands `/api/*` to `api/`.
- `scripts/` — the build steps (index generators, `copy-content.cjs`, `prerender.mjs`) and the
  admin-guard check.
- `dist/` — the built site (gitignored). `npm run build` creates it; it's the only thing deployed.

## Writing module content

Modules are plain markdown. On top of that, seven **content blocks** give technical prose a structure
readers can navigate by — a definition, a worked example and a warning shouldn't all look like the same
paragraph. The syntax is [GitHub's alert syntax](https://docs.github.com/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts),
so these files still read correctly in the repo, not just in the app:

```markdown
> [!key] The one sentence the rest of the module follows from.

> [!check]
> - Explain why a queue is not a thread pool
> - Describe what happens when a worker dies mid-job
```

| Block | Renders as | For |
| --- | --- | --- |
| `[!key]` | Key idea | The claim the module rests on |
| `[!example]` | Example | A worked, concrete case |
| `[!model]` | Mental model | A diagram or analogy to think with |
| `[!pitfall]` | Pitfall | The mistake people actually make |
| `[!interview]` | Interview | What you should be able to explain out loud |
| `[!exercise]` | Exercise | Something to try yourself |
| `[!check]` | Check your understanding | Closes the module |

GitHub's own `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` and `[!CAUTION]` render too. Anything
else stays an ordinary blockquote, and a module using no blocks renders exactly as it always has — so
retrofitting is optional and incremental. The admin editor has an insert button for each block.

## Running it locally

```bash
npm install && npm install --prefix webapp   # once
npm run build                                # builds the site into dist/
npx wrangler pages dev --port 8788           # backend: API + local database
npm run dev --prefix webapp -- --port 4173   # frontend with hot reload
```

Then <http://localhost:4173>. Use **port 4173** — it's the one registered with
Google as an OAuth redirect URI, and sign-in fails on any other.

The backend needs `.dev.vars` (gitignored, holds real credentials) and a local
D1 database. **[LOCAL-SETUP.md](LOCAL-SETUP.md)** covers both.

## Deployment

Pushing to `main` deploys to Cloudflare Pages (`.github/workflows/cloudflare-pages.yml`): it runs
`npm run build` and uploads `dist/`. The build also generates a real, indexable page for every module
(each at its folder's URL, e.g. `/backend/01-request-response-fundamentals/`) and the sitemap.
Module content stays in markdown — the HTML is generated from it on every deploy.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — curriculum corrections and additions are welcome; the app in `webapp/`/`api/` is maintained more tightly since it's live for real accounts.

Found a security issue? See [SECURITY.md](SECURITY.md) rather than opening a public issue.

## License

MIT — see [LICENSE](LICENSE).
