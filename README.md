# Backend Roadmap

A hands-on curriculum for backend engineering, infrastructure, low-level design, and system design —
plus the progress-tracking app that serves it.

**Live site:** <https://backendroadmap.com/>

## What's in here

- `backend/`, `learn/`, `genai/`, `lld/` — the curriculum content itself, one markdown file per module.
  Each top-level directory's own `README.md` explains its own structure and conventions.
- `webapp/` — the React app that renders the curriculum: a searchable module tree, progress tracking
  (works signed-out via IndexedDB, syncs across devices once signed in with Google), bookmarks, private
  notes, comments, reactions, and an admin dashboard.
- `api-cf/` — the API: a [Hono](https://hono.dev) app on Cloudflare Pages Functions (entry point
  `functions/api/[[path]].js`) backed by Cloudflare D1 — Google OAuth, progress sync, comments, notes,
  bookmarks, reactions, streaks, feed, and a GitHub-commit-based content editor. Uploaded files live in
  Azure Blob Storage. Schema: `cloudflare/d1-schema.sql`.
- `scripts/` — build-time index generators (`gen-docs-index.py`, `gen-search-index.py`), the deploy
  stager (`stage-dist.cjs`), and the admin-guard check, all run by CI.

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
npx wrangler pages dev --port 8788                        # backend (repo root)
cd webapp && npm install && npm run dev -- --port 4173    # frontend
```

Then <http://localhost:4173>. Use **port 4173** — it's the one registered with
Google as an OAuth redirect URI, and sign-in fails on any other.

The backend needs `.dev.vars` (gitignored, holds real credentials) and a local
D1 database. **[LOCAL-SETUP.md](LOCAL-SETUP.md)** covers both.

## Deployment

Pushes to `main` trigger two workflows: Cloudflare Pages (the live site and API) and GitHub Pages (a
static mirror with no login/API). See `.github/workflows/`. Only the allowlisted `dist/` built by
`scripts/stage-dist.cjs` is ever deployed.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — curriculum corrections and additions are welcome; the app in `webapp/`/`api-cf/` is maintained more tightly since it's live for real accounts.

Found a security issue? See [SECURITY.md](SECURITY.md) rather than opening a public issue.

## License

MIT — see [LICENSE](LICENSE).
