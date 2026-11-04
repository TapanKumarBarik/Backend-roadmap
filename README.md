# Backend Roadmap

The source of **[backendroadmap.com](https://backendroadmap.com/)**: a free-to-read curriculum for backend engineering, system design, cloud / DevOps, low-level design and GenAI, with the **System Design Interview Prep** video course on [YouTube](https://www.youtube.com/@tapankumarbarik9454).

This repository is private and proprietary. See [LICENSE](LICENSE).

## What is here

| Folder | What it holds |
|---|---|
| `content/` | The curriculum, one folder per module with its `README.md` (and `images/`). Curricula: `backend`, `system-design`, `learn`, `genai`, `lld`. |
| `content/videos.json` | The YouTube videos and the module each one belongs to ([docs/VIDEOS.md](docs/VIDEOS.md)). |
| `webapp/` | The React + Vite app that serves the site; `webapp/public/notes/` holds the free PDF notes. |
| `api/`, `functions/` | The API on Cloudflare Pages Functions (accounts, progress, community, admin). |
| `scripts/` | Build, index, check and sync scripts. |
| `docs/` | How the site works: content rules, images, videos, SEO, architecture. |

## Working on it

```bash
npm ci
npm run dev        # the app on http://localhost:4173
npm run check      # content checks: paths, images, videos, SEO, overviews, practice
npm test
npm run build      # what the deploy runs
```

Every push to `main` deploys to Cloudflare Pages (`.github/workflows/cloudflare-pages.yml`).

© 2026 Tapan Kumar Barik. All rights reserved.
