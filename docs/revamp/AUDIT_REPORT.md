# BackendRoadmap 2.0: audit report (Phase 0)

Written 2026-11-03, from the repository at commit `daa2a0c`. It answers: what is here, how it is built, and what that means for the
2.0 brief. Companion documents: [EXISTING_FEATURES_INVENTORY](EXISTING_FEATURES_INVENTORY.md),
[ROUTE_AND_PAGE_INVENTORY](ROUTE_AND_PAGE_INVENTORY.md), [DATA_MODEL_INVENTORY](DATA_MODEL_INVENTORY.md),
[REVAMP_IMPLEMENTATION_PLAN](REVAMP_IMPLEMENTATION_PLAN.md). Nothing was deleted, renamed or migrated to write them.

## The most important finding

**Roughly half of the 2.0 brief's first six phases is already built**, in a first revamp (docs/MODERNIZATION.md, phases 1 to 6) that
is committed and mostly live: a design system with light and dark themes, a labelled navigation, a community blog with a block
editor and an optional AI assistant, a Community hub, search across lessons and articles, accessibility and responsiveness audits,
motion, performance budgets, and a URL-preservation gate. 2.0 should **extend** that, not redo it. What is genuinely new is the
**Practice Center** (quizzes, exercises, interview prep), the **Design Lab** (LLD and HLD challenges with submissions), a
**moderated community content model** (more content types, review states), **My Learning**, and a broader **admin**.

The second finding is a constraint: **837 public addresses are published** (YouTube descriptions, other sites, search results). They
are registered in `docs/url-registry.tsv` and enforced on every build (`npm run check:urls`). Every 2.0 route decision answers to that.

## Stack

| Layer | What it is |
|---|---|
| Frontend | React 18 single-page app, Vite 8, plain CSS (tokens, no UI or animation library), Tiptap 3 for editing, Mermaid and highlight.js lazily loaded. One workspace package `webapp/`. |
| Backend | Hono app (`api/`) running as a Cloudflare Pages Function at `/api/*`; three more Pages Functions draw `/blog`, `/authors`, `/write` for crawlers. |
| Database | Cloudflare D1 (SQLite), 24 tables in two numbered migrations applied by hand (`npm run db:migrate:remote`). |
| Auth | Google OAuth, a signed session cookie (30 days), `admins` table plus an owner e-mail; every `/api/manage/*` route is guarded by `isAdmin`, enforced by a check and a test. |
| Content | Markdown in `content/<curriculum>/<track>/<module>/README.md` (backend 190 pages, learn 266, genai 315, lld 25, system-design 21), `content/paths.json` (8 learning paths), `content/videos.json` (60 videos in two playlists). |
| Build | Node-only: Vite build, then scripts that index, copy content, draw 653 share cards and prerender 817 pages with their text, canonical and structured data. |
| Storage | Azure Blob Storage for uploads (feed attachments, article pictures); `GET` public. |
| Hosting | Cloudflare Pages; `_headers` carries the CSP; GitHub Actions run the same verify action on pull requests and deploys. |
| Tests | 319 unit/API tests (node:test; the API runs on an in-memory SQLite standing in for D1), 104 Playwright tests against the built site, size budgets, URL registry. |

## Architecture assessment

It is already the modular monolith the brief prefers: one repo, one API, one database, one auth. Layers are separated in the way that
matters here: `webapp/src/lib` is framework-free logic (routing, markdown, blog document model, search), `webapp/src/components` is
presentation, `api/routes` are thin handlers over `api/lib`, `config/` and `site.config.json` hold copy and tunables. **No second
database, auth provider or CMS is needed or proposed.**

## Strengths to protect

- Content is plain Markdown in git, prerendered, so lessons are fast, indexable and independent of the API.
- Security posture: stored XSS is closed by design (blog documents are rebuilt from an allow-list and drawn by a DOM-free renderer;
  images only from upload origins; links keep to a few schemes), CSP, rate limits on every write, backend ownership checks tested.
- Progress, notes, bookmarks and the workspace work signed out (local) and sync when signed in.
- Honest saving, offline behaviour and conflict handling in the studio.
- Every route's authorization is listed by a test that fails if a new route is open by accident.

## Gaps against the brief

| Brief | Today | Gap |
|---|---|---|
| Quizzes, exercises, interview prep | none (the curricula contain self-check questions in Markdown) | New domain: questions, attempts, scoring |
| Design Lab (LLD and HLD challenges, submissions, reference solutions) | `content/lld` and `content/system-design` hold lessons; no challenges or submissions | New domain; reuse the studio editor and Mermaid |
| Community content types and review states | feed posts, books, ideas, questions, articles; articles are live-but-noindex until approved | Add types and a general review state; most moderation exists for articles |
| My Learning | progress, bookmarks, notes, workspace, saved articles live on separate screens | One page that gathers them (data exists) |
| Learning path detail, filters, prerequisites | 8 paths with steps; picker on the dashboard | A path page and filters; difficulty and prerequisites need new data fields |
| Lesson page: collapsible panels, reading preferences, related quizzes/challenges, version history | tree + article + outline exist; notes and bookmarks exist | Collapse exists for the tree and the right rail; preferences, related items and version history are new |
| Admin: quiz bank, challenge review, roles, SEO, announcements, audit logs | content editor (commits to GitHub), moderation, users and admins, analytics, messages, articles | Audit log, announcements, SEO management, quiz and challenge management are new |
| YouTube hub | Videos screen, 60 videos in two playlists, video-to-module mapping, chapters | Timestamps and notes beyond chapters need real data |
| Global search across everything | modules (full text), tags, articles and authors | Quizzes, challenges and community content once they exist |
| Nav: Explore, Learn, Practice, Design Lab, Community, My Learning | rail: Curriculum, Explore, Videos, Blogs, Community, Saved, Workspace | A restructure of labels and groups, not of addresses |
| WCAG 2.2 AA | machine audit on 18 screens passes; contrast, focus, reduced motion tested | Manual screen-reader passes and target-size checks for new screens |

## Risks

1. **Public URLs** (release-blocking, handled): the registry and `check:urls`.
2. **Migrations are manual and additive-only**: a new table must be applied with `npm run db:migrate:remote` before the code ships; the
   deploy smoke test calls a blog endpoint, so a forgotten migration fails the run. 2.0 will add more tables; the smoke test must grow with them.
3. **User-generated code and diagrams** (submissions) widen the XSS surface: Mermaid output and uploaded diagrams need the same allow-list discipline as articles.
4. **Scale of 2.0 vs a one-person project**: five new domains. They must ship as independent, reversible slices.
5. **Privacy**: submissions and attempts are private data; `privacy.html` and `terms.html` need the update drafted in `docs/PRIVACY-TERMS-DRAFT.md`, and will need more.
6. **Account deletion** must grow with every new table (the single list in `api/lib/*Removal` pattern exists for this).
