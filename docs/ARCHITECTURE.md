# Architecture

How this repository fits together, for someone who is about to change it. The how-to for running it is
[LOCAL-SETUP.md](LOCAL-SETUP.md); how to contribute is [CONTRIBUTING.md](../CONTRIBUTING.md).

## The idea in one paragraph

The site is a library of Markdown lessons (`content/`) turned into a fast, searchable reading app. At build time every
lesson becomes a real HTML page (so search engines and slow phones get text straight away), plus two small indexes the
app uses to build its menu and its search. In the browser a React app takes over to add progress tracking, notes,
comments and the rest. Everything that belongs to a signed-in reader lives behind one small API on Cloudflare, backed
by one SQLite database. The lessons never touch the database, and the database never contains a lesson.

## Where things are

```text
content/        what the author writes: backend/ learn/ genai/ lld/ (one README.md per module) and paths.json
webapp/         the React app (Vite). src/components/<screen>, src/hooks, src/lib/{markdown,curriculum,search}
api/            the server: Hono routes, the D1 migrations, and the API's tests
functions/      the one file Cloudflare Pages looks for; it hands /api/* to api/
scripts/        the build (build/), the checks (check/), maintenance (maintain/), shared code (lib/), dev tools (dev/)
tests/e2e/      browser tests of the built site, signed out and signed in
docs/           this folder: local setup, images, videos, roadmap
.github/        CI (one shared action, two workflows), issue and PR templates, Dependabot, CODEOWNERS
site.config.json   the one place that names things: site, developer, repo, content folder, storage keys, screenshots
wrangler.jsonc  the Cloudflare project: the database binding, variables, where migrations live
dist/           the built site, git-ignored. The only thing ever deployed
```

`functions/` has to be at the root because Cloudflare looks there; the code lives in `api/` so the entry stays a
three-line file.

## One lesson, end to end

A lesson is `content/<curriculum>/<track>/<module>/README.md`. Its **key** is the path from `content/`
(`backend/03-authentication-and-authorization/01-sessions-and-cookies/README.md`), and that one string is used
everywhere: the URL (`/backend/03-.../01-sessions-and-cookies/`), the module index, a reader's progress, bookmarks and
notes in the database, the search index. That is why moving the content folder changed none of them, and why renaming
a module folder is the one change that orphans a reader's saved progress.

`npm run build` makes the site in `dist/`, in this order:

1. **`vite build`** bundles the app.
2. **`npm run index`** writes `docs-index.json` (the menu tree with titles, tags and reading times),
   `search-index.json` (a word index over every lesson) and `site-stats.json` (honest module counts for the landing page).
   The code is in `scripts/lib/` (`docsIndex`, `searchIndex`, `tags`, `content`) and is unit-tested.
3. **`copy-content`** copies the four curricula to `dist/`, and refuses to continue if anything that looks like a secret
   is in there. `dist/` is an allow-list on purpose: deploying the repository root once published local secrets.
4. **`prerender`** writes a static page for each lesson (title, description, canonical link, Open Graph, structured
   data, the lesson text itself, previous and next links) and `sitemap.xml`. A lesson that still carries the
   placeholder sentence is marked `noindex` and left out of the sitemap, so unwritten modules cannot thin out the site.

Then Cloudflare Pages serves static files, with `webapp/public/_headers` (security headers, the Content-Security-Policy)
and `_routes.json` (only `/api/*` runs code).

A reader opening a lesson gets its pre-rendered page immediately; the React app then boots, fetches the lesson's
Markdown and `docs-index.json` (both preloaded by the page), and renders the same lesson itself. The rendering code
(`webapp/src/lib/markdown/`) is shared between the browser and the build, so the static page and the live page agree.
It reads every kind of line ending the same way, which is why a Windows checkout builds the same pages as Linux.

## The account side

`/api/*` is a Cloudflare Pages Function: `functions/api/[[path]].js` calls `api/app.js`, a Hono app made of one router per
area (`routes/study.js` for bookmarks, notes and progress; `comments`, `feed`, `community`, `workspace`, `admin`,
`content`, `auth`). Sign-in is Google OAuth; the session is an HMAC-signed `HttpOnly` cookie, so there is no session
table. Every route is checked by `api/tests/access.test.js`: it calls all of them without signing in and fails for any that
answers, unless the route is on a written-out public list.

The database is Cloudflare D1 (SQLite). Its schema is `api/migrations/`, numbered files applied once each; see
[api/README.md](../api/README.md) for how to change it safely. Nothing a reader writes is needed to *read* the site: if the
API is down, lessons still open and a notice says what could not load.

## Configuration, and why it is one file

`site.config.json` holds everything that would otherwise be a literal in code: the site's name and URL, the developer's
contact details, the repository and branch, the content folder and curriculum list, the placeholder sentence, the reading
speed, every browser-storage key, the screenshots. The app imports it through `webapp/src/config/`, the build and the
checks through `scripts/lib/config.mjs`, the API directly. Copy that appears on screen (landing page, error messages)
lives in `webapp/src/config/` too. Learning paths are data in `content/paths.json`.

## How we know it works

| Gate | Command | What it catches |
|---|---|---|
| Lint | `npm run lint` | unused code, wrong globals for the runtime (browser, Workers, Node), React hook mistakes |
| Types | `npm run typecheck` | the API, scripts and the app's non-component code, checked as JavaScript with `tsc` |
| Unit tests | `npm test` | the build's logic, the markdown pipeline, and the API (real routes on in-memory SQLite) |
| Checks | `npm run check` | an `isAdmin()` without `await`, a broken `paths.json`, a missing or oversized lesson image |
| Build | `npm run build` | the whole site assembles; internal links that point nowhere are listed |
| Browser | `npm run test:e2e` | a lesson opens, links work, videos play under the real CSP, and the signed-in flows (progress, the workspace editor, the admin dashboard) against the real API |

CI runs all of them, from one shared definition (`.github/actions/verify`), on every pull request and before every
deploy. The deploy workflow adds the Cloudflare steps, then tells Bing and other IndexNow engines which pages changed.

## Decisions worth knowing

- **Content under `content/`, not at the root.** The root was four courses next to code. URLs, keys and saved data are
  unchanged because the key is the path from the content folder.
- **No TypeScript, but checked JavaScript.** `tsc` with `checkJs` over the API, scripts and the app's logic gives most of the
  benefit without converting 10,000 lines. React components are left out: their props are untyped destructuring, so the
  checker would report noise.
- **No Prettier.** A trial would have rewritten 5,300 of 12,200 lines, burying history for no gain. `.editorconfig` and
  ESLint are the rules.
- **React 18, not 19.** Measured: React 19 makes the first download of every page about 22 KB (gzipped) bigger, for
  nothing this app uses. Dependabot is told to leave React's major version alone (`.github/dependabot.yml`).
- **The API is tested in-process.** Node's built-in SQLite stands in for D1, and the browser tests answer `/api` requests
  with the real app inside the test process, so there is no second server to start and the page and the API are tested
  together.
- **Workspaces.** `webapp/` is an npm workspace: one install, one lockfile, one Dependabot entry.
- **Raw `.md` files are `noindex`.** The site serves the lesson sources next to the pages (the app fetches them), and
  search engines should list the pages, not the sources.

## Where to change what

| I want to... | Edit |
|---|---|
| write or fix a lesson | `content/<curriculum>/<track>/<module>/README.md`, then `npm run index` if the title or folder changed |
| add an image or a video | [IMAGES.md](IMAGES.md), [VIDEOS.md](VIDEOS.md) |
| change a learning path | `content/paths.json`, then `npm run check:paths` |
| change the site name, a link or a storage key | `site.config.json` |
| change landing-page or error wording | `webapp/src/config/landing.js`, `webapp/src/config/messages.js` |
| add an API route | `api/routes/<area>.js`; it must ask for a sign-in unless it is added to `PUBLIC` in `api/tests/access.test.js` |
| change the database | a new numbered file in `api/migrations/` ([api/README.md](../api/README.md)) |
| change what a lesson is tagged with | `scripts/lib/tag-vocabulary.mjs`; see the result with `node scripts/dev/tags.mjs <lesson>` |
| change the security headers | `webapp/public/_headers` (the browser tests apply them) |
