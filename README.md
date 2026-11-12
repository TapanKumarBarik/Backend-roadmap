# Backend Roadmap

The source of **[backendroadmap.com](https://backendroadmap.com/)**: a free-to-read curriculum for backend engineering, system design, cloud / DevOps, low-level design and GenAI, with the **System Design Interview Prep** video course on [YouTube](https://www.youtube.com/@tapankumarbarik9454).

This repository is private and proprietary. See [LICENSE](LICENSE).

## What is here

| Folder | What it holds |
|---|---|
| `content/` | The curriculum, one folder per module with its `README.md` (and `images/`). Seven areas: `backend`, `system-design`, `ml`, `neural-networks`, `genai`, `learn` (Linux to Cloud) and `lld`, described in `site.config.json` (`content.areas`). Also `practice/` (quizzes, exercises, interview and coding questions), `paths.json`. |
| `game.config.json` | The rules of the learning game (XP, levels, badges, which icon draws what) ([docs/DESIGN.md](docs/DESIGN.md)). |
| `content/videos.json` | The YouTube videos and the module each one belongs to ([docs/VIDEOS.md](docs/VIDEOS.md)). |
| `webapp/` | The React + Vite app that serves the site; `webapp/public/notes/` holds the free PDF notes. |
| `api/`, `functions/` | The API on Cloudflare Pages Functions (accounts, progress, community, admin). |
| `scripts/` | Build, index, check and sync scripts. |
| `docs/` | How the site works, starting with [docs/README.md](docs/README.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the library's areas, content rules, practice, videos, SEO, the checks. |

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
