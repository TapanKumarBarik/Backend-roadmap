# Backend Roadmap

A hands-on curriculum for backend engineering, infrastructure, low-level design, and system design —
plus the progress-tracking app that serves it.

**Live site:** <https://calm-ocean-0635a4a0f.3.azurestaticapps.net/>

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
