# Backend Roadmap

A hands-on curriculum for backend engineering, infrastructure, low-level design, and system design —
plus the progress-tracking app that serves it.

**Live site:** <https://backendroadmap.in/>

## What's in here

- `backend/`, `learn/`, `genai/`, `lld/` — the curriculum content itself, one markdown file per module.
  Each top-level directory's own `README.md` explains its own structure and conventions.
- `webapp/` — the React app that renders the curriculum: a searchable module tree, progress tracking
  (works signed-out via IndexedDB, syncs across devices once signed in with Google), bookmarks, private
  notes, comments, reactions, and an admin dashboard.
- `api/` — the Azure Functions backend (Node.js): Google OAuth, progress sync, comments, notes,
  bookmarks, reactions, streaks, a GitHub-commit-based content editor, and a daily Table Storage backup.
- `scripts/` — build-time index generators (`gen-docs-index.py`, `gen-search-index.py`) that CI runs
  before every deploy.

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
cd webapp && npm install && npm run dev      # frontend, http://localhost:5173
cd api && npm install && func start          # backend, needs local.settings.json (not committed)
```

## Deployment

Pushes to `main` trigger two CI/CD workflows: Azure Static Web Apps (the live site, with the API) and
GitHub Pages (a static mirror with no login/API). See `.github/workflows/`.

## License

MIT — see [LICENSE](LICENSE).
