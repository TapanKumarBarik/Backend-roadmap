# Architecture

How this repository fits together, for someone who is about to change it. How to run it is [LOCAL-SETUP.md](LOCAL-SETUP.md); the
other documents are listed in [README.md](README.md).

## The idea in one paragraph

The site is a library of Markdown lessons (`content/`) turned into a fast, searchable reading app, with practice, a design lab,
a community and a personal workspace on top. At build time every lesson becomes a real HTML page (so search engines and slow
phones get text straight away), plus small indexes the app uses to build its menu and its search. In the browser a React app takes
over to add progress, notes, comments and the rest. Everything that belongs to a signed-in reader lives behind one small API on
Cloudflare, backed by one SQLite database. **The lessons never touch the database, and the database never contains a lesson.**

## Where things are

```text
content/        what the author writes
                  backend/ system-design/ genai/ learn/ lld/   the five curricula, one README.md per module
                  practice/    quizzes, exercises and interview sets (JSON)      design-lab/  design challenges (JSON + Mermaid)
                  paths.json   the learning paths      videos.json   the channel's videos and the module each belongs to
                  seo.json     titles and descriptions that override the generated ones
webapp/         the React app (Vite).   src/components/<screen>  src/hooks  src/lib/<topic>  src/config (words)  src/styles
                public/ holds what is served as it is: _headers, _redirects, the PDF notes under notes/, icons, privacy and terms
api/            the server: Hono routes (routes/), data helpers (lib/), the D1 migrations, the generated practice file, tests/
functions/      the files Cloudflare Pages looks for; they hand /api/* and the community's pages to api/
scripts/        build/ (makes dist/)  check/ (the gates)  maintain/ (sync and one-off jobs)  dev/ (screenshots, Lighthouse, Linux CI)  lib/ (shared, tested)
tests/e2e/      browser tests of the built site, signed out and signed in
docs/           this folder
.github/        CI: one shared action (actions/verify), the deploy and the pull-request workflows, Dependabot, CODEOWNERS
site.config.json   the one place that names things (see "Configuration")
wrangler.jsonc  the Cloudflare project: the database binding, variables, where migrations live
dist/           the built site, git-ignored. The only thing ever deployed
screenshots/    local development screenshots, git-ignored (see "Screenshots")
```

`functions/` has to be at the root because Cloudflare looks there; the code lives in `api/` so each entry stays a few lines.

## The library: five areas, tracks, modules

A **module** is one lesson: `content/<curriculum>/<track>/<module>/README.md`. A **track** is a folder of modules; a **curriculum** is a
folder of tracks (`lld` has modules straight under it). The library is shown to readers as five **areas**, one per curriculum, and
`site.config.json -> content.areas` is the one place that describes them: the name, a short name for the switcher, a line about it,
and how its tracks are **grouped under headings** ("The request path", "Data and speed"...). That one entry feeds the home page's
library cards, the tree, the area switcher, breadcrumbs, page titles and share cards, so an area is called the same thing everywhere.
Grouping is display only: nothing moves on disk, so no address and no saved progress changes. A track no group names shows under "More"
(`npm run check:areas` lists them, and fails on a typo or a missing folder).

A lesson's **key** is its path from `content/` (`backend/03-authentication-and-authorization/01-sessions-and-cookies/README.md`), and that
one string is used everywhere: the URL (`/backend/03-.../01-sessions-and-cookies/`), the module index, a reader's progress, bookmarks and
notes in the database, the search index. That is why moving the content folder changed none of them, and why **renaming a module folder is
the one change that orphans a reader's saved progress and breaks an address**.

How a reader finds their way, from the broadest to the narrowest: the **top navigation** (Learn, Explore, Practice, Design Lab, Community,
My Learning; `webapp/src/config/nav.js`), a **learning path** (a short ordered route with a finish line, `content/paths.json`), the **area
switcher and grouped tree** in the sidebar (`components/layout/AreaSwitch.jsx`, `Tree.jsx`; one area at a time, following the lesson being
read), and **search** (Ctrl K) over every lesson.

## How a page is built and served

`npm run build` makes the site in `dist/`, in this order:

1. **`vite build`** bundles the app.
2. **`npm run index`** writes `docs-index.json` (the tree with titles, tags, reading times and which modules have a video),
   `search-index.json`, `site-stats.json` (honest module counts for the home page) and `videos.json` (the channel's videos, resolved
   from `content/videos.json`; a mistake in that file stops the build). Code in `scripts/lib/`, unit-tested.
3. **`copy-content`** copies the curricula to `dist/`, and refuses to continue if anything that looks like a secret is in there. `dist/` is
   an allow-list on purpose: deploying the repository root once published local secrets.
4. **`gen-share-images`** draws a 1200x630 share card with the page's own title for every page into `dist/og/` (satori lays it out, resvg
   makes the PNG, both in plain Node; size and colours are `site.config.json -> shareImage`).
5. **`prerender`** writes a static page for each lesson (title, description, canonical link, Open Graph, structured data, the lesson text,
   previous and next links), the home page, the listing pages for paths and videos, and `sitemap.xml`. A lesson that still carries the
   placeholder sentence is `noindex` and out of the sitemap, unless it has a video: then the page is the video and what it covers.

Cloudflare Pages then serves static files, with `webapp/public/_headers` (security headers, the Content-Security-Policy), `_redirects`
(moved addresses; the permanent ones) and `_routes.json` (only `/api/*` and the community's pages run code). A reader opening a lesson gets
its pre-rendered page at once; the React app then boots, fetches the lesson's Markdown and `docs-index.json` (both preloaded by the page)
and renders the same lesson itself. The rendering code (`webapp/src/lib/markdown/`) is shared between browser and build, so the static
page and the live page agree.

**Addresses.** A lesson, a path (`/paths/<id>/`), the Videos list (`/videos/`), Practice (`/practice/`) and the Design Lab (`/design-lab/`,
`/lab/` redirects to it) are real built pages. Other screens (My Learning, the workspace, the studio, admin) are hash screens of the one
app. The table is `webapp/src/lib/appPages.js`. Every address ever published is in `docs/url-registry.tsv`, and `npm run check:urls` fails
if one stops answering, loses its canonical address or gains `noindex`; see [URL_MIGRATION_REGISTRY.md](URL_MIGRATION_REGISTRY.md).

**Videos** are a second kind of content, beside the lessons: `content/videos.json` (kept up to date by `npm run videos:sync`) lists them,
each with its module. The module page shows its video under the title, with chapters that start the player at that point; the sidebar
marks the module; the Videos screen and the home page list them. A video not public yet is not shown. [VIDEOS.md](VIDEOS.md).

**Tools** are small pages of their own, not screens of the app: the subnet calculator and drills at `/tools/subnet/`. Each is an HTML entry under
`webapp/tools/<name>/index.html` with plain-DOM script in `webapp/src/tools/` (no React, so it is small and quick), built as an extra entry of the same
Vite build and listed in `site.config.json -> tools` (which also puts it in the sitemap). The logic is pure and tested in `webapp/src/lib/netlab/`
(`cidr.js` the arithmetic, `questions.js` seeded questions with their working and an answer checker, `session.js` the streak). Everything is checked in the
browser, so there is no server and no cost. The puzzle of the day is made from the UTC date, so it is the same for everyone.

**PDF notes** are files in `webapp/public/notes/system-design/` (one per lesson, plus a bundle per phase), served as they are and linked
from the lesson.

## Practice and the Design Lab

Quizzes, exercises, interview sets and design challenges are **files in `content/practice/` and `content/design-lab/`**, not database
rows. `npm run practice:build` validates them and writes `api/generated/practice-content.json`, which the API is bundled with (CI
regenerates it first; `npm run check` fails locally if the committed copy is stale). Answers and explanations never leave the server before
a try. What a reader *does* with them (attempts, scores, weak areas, a design submission, peer feedback) is in the database. The validators
are pure functions in `webapp/src/lib/practice/validate.js`, shared by the build, the API and the browser editor. [PRACTICE.md](PRACTICE.md).

## The account side

`/api/*` is a Cloudflare Pages Function: `functions/api/[[path]].js` calls `api/app.js`, a Hono app made of one router per area (`study`
for bookmarks, notes and progress; `practice`; `comments`; `feed`; `blogs`; `community`; `workspace` and `revision`; `popular`; `admin`;
`content`; `auth`; `assistant`). Sign-in is Google OAuth; the session is an HMAC-signed `HttpOnly` cookie, so there is no session table.
Every route is checked by `api/tests/access.test.js`: it calls all of them without signing in and fails for any that answers, unless the
route is on a written-out public list; `/api/manage/*` must also refuse a signed-in non-admin.

The community's articles have real addresses (`/blog/`, `/blog/<slug>`, `/authors/<handle>`, `/write`), and a file cannot be behind an
address made when someone writes. Small Pages Functions under `functions/` answer them with `api/pages/blogPages.js`, which takes the app
shell (`dist/app-shell.html`) and writes the article's title, description, canonical address, social tags, structured data and text into
it. An article is live when published but `noindex` until its author is trusted or an admin approves it. `scripts/lib/smoke.mjs` checks
after every deploy that these answer. The writing studio is [STUDIO.md](STUDIO.md).

The **workspace** (pages, folders, study plans, revision lists, diagrams) is private to its owner; the **admin** screens (moderation,
notices, the audit log, practice content, paths, videos, SEO) are for admins only. The admin content editor commits to GitHub through
`api/routes/content.js`, which has an allow-list of what it may write (lessons, practice files, `paths.json`, `videos.json`, `seo.json`)
and validates every file with the same code the build uses; [ADMIN_CONTENT.md](ADMIN_CONTENT.md).

The database is Cloudflare D1 (SQLite). Its schema is `api/migrations/` (`0001` accounts, `0002` blogs, `0003` practice and design lab,
`0004` peer reviews, `0005` community workflow, `0006` workspace hub): numbered, additive files applied once each; see
[api/README.md](../api/README.md). Nothing a reader writes is needed to *read* the site: if the API is down, lessons still open and a
notice says what could not load.

## Configuration, and why it is one file

`site.config.json` holds everything that would otherwise be a literal in code: the site's name and URL, the developer's contact details,
the repository, the content folder, the **curricula and their areas**, the placeholder sentence, the reading speed, every browser-storage
key, the share cards' size and colours, the budgets, the screenshots. The app imports it through `webapp/src/config/`, the build and the
checks through `scripts/lib/config.mjs`, the API directly. The words that appear on screen (home page, error messages, practice copy)
live in `webapp/src/config/` too; those modules import their JSON with `with { type: 'json' }`, which lets the build reuse the home page's
wording in plain Node. Colours, sizes and layers are tokens in `webapp/src/styles/tokens.css` ([DESIGN.md](DESIGN.md)).

## How we know it works

| Gate | Command | What it catches |
|---|---|---|
| Lint | `npm run lint` | unused code, wrong globals for the runtime (browser, Workers, Node), React hook mistakes |
| Types | `npm run typecheck` | the API, scripts and the app's non-component code, checked as JavaScript with `tsc` |
| Unit tests | `npm test` | the build's logic, the markdown pipeline, the area and path rules, and the API (real routes on in-memory SQLite) |
| Checks | `npm run check` | an `isAdmin()` without `await`; `paths.json`; the areas config against the folders; lesson images; videos naming a missing module; SEO overrides; an overview that says it is unwritten; practice content and its generated file |
| Build | `npm run build` | the whole site assembles; internal links that point nowhere are listed |
| URLs | `npm run check:urls` | every published address still answers (above). Before a release, `npm run check:urls:live -- <staging url>` |
| Size | `npm run check:bundle` | what a first visit downloads and what each heavy screen adds, within `budgets` in `site.config.json`; run after the build |
| Browser | `npm run test:e2e` | a lesson opens, videos play under the real CSP, the built pages carry what search engines read, the signed-in flows against the real API, and every screen is audited for names, labels, ids, landmarks and sideways scrolling from 360 to 1920 px |
| Linux | `npm run ci:linux` | the same steps in a Node 22 + Chromium container, for what differs from Windows (fonts, `localhost`, speed) |
| Lighthouse | `npm run lighthouse` | accessibility, SEO and performance of the built pages (by hand, not in CI) |

CI runs the first eight from one shared definition (`.github/actions/verify`) on every pull request and before every deploy. The deploy
workflow then adds the Cloudflare steps, a smoke test, and tells Bing and other IndexNow engines which pages changed. **A failing step
stops the deploy**, and the site stays on the last good version.

## Screenshots

`npm run shots` opens the built site (`npm run build && npm run preview`, port 4180) in a real browser and saves every page and size
listed in `site.config.json -> screenshots` into `screenshots/`: one copy per page, size and theme, replaced on each run, git-ignored.
To add a page, add an entry there. Look at it after a UI change; use git, not old screenshots, to see what a change did.

## Decisions worth knowing

- **Content under `content/`, not at the root.** URLs, keys and saved data are unchanged because the key is the path from the content folder.
- **Areas and groups are configuration, not folders.** Regrouping the library, or renaming an area, is an edit to `site.config.json`; it never
  moves a lesson and never changes an address.
- **Practice content is files in git, data is rows in the database.** Content gets review and history; a reader's answers get a table.
- **No TypeScript, but checked JavaScript.** `tsc` with `checkJs` over the API, scripts and the app's logic gives most of the benefit
  without converting every file. React components are left out: their props are untyped destructuring, so the checker would be noise.
- **No Prettier.** A trial would have rewritten 5,300 of 12,200 lines, burying history for no gain. `.editorconfig` and ESLint are the rules.
- **React 18, not 19.** Measured: React 19 made the first download of every page about 22 KB (gzipped) bigger, for nothing this app uses.
- **The first-page budget is 130 KB of JavaScript (gzip)**, raised on purpose from 125 for the top navigation and the new home page; the
  heavy screens are separate chunks with their own budgets.
- **The API is tested in-process.** Node's built-in SQLite stands in for D1, and the browser tests answer `/api` requests with the real app
  inside the test process, so there is no second server to start.
- **Workspaces.** `webapp/` is an npm workspace: one install, one lockfile, one Dependabot entry.
- **Raw `.md` files are `noindex`.** The site serves the lesson sources next to the pages (the app fetches them), and search engines should
  list the pages.
- **Share cards are drawn at build time, in Node,** not by a headless browser and not on request. About 650 cards take 15 to 30 seconds.
- **An overview is never a placeholder.** `npm run check` fails if a curriculum or track page carries the "not written yet" sentence.

## Where to change what

| I want to... | Edit |
|---|---|
| write or fix a lesson | `content/<curriculum>/<track>/<module>/README.md`, then `npm run index` if the title or folder changed |
| add a module or a track | a folder with a `README.md` under its parent; **give a new track a group** in `content.areas` (else it shows under "More"); `npm run check` |
| rename or regroup an area, or change what it says | `site.config.json` -> `content.areas`; `npm run check:areas` |
| add a curriculum | a folder in `content/`; its name in `content.curricula` **and** an entry in `content.areas` (same order); a tag in `scripts/lib/tag-vocabulary.mjs`; `npm run check` |
| add an image | [IMAGES.md](IMAGES.md) |
| add a video | `npm run videos:sync`, then give it a `"module"` in `content/videos.json`; `npm run check` ([VIDEOS.md](VIDEOS.md)) |
| add a tool page | an HTML entry in `webapp/tools/<name>/`, its script in `webapp/src/tools/`, an entry in `site.config.json -> tools`, a test in `tests/e2e/tools.e2e.mjs` and a line in `tests/e2e/audit.e2e.mjs` |
| add a PDF note | a file in `webapp/public/notes/system-design/`, and a link from the lesson |
| add or fix a quiz, exercise, interview set or design challenge | a file in `content/practice/` or `content/design-lab/`, then `npm run practice:build` ([PRACTICE.md](PRACTICE.md)); or an admin, in the browser |
| change a learning path | `content/paths.json`, then `npm run check:paths` |
| change the site name, a link or a storage key | `site.config.json` |
| change home-page, navigation or error wording | `webapp/src/config/landing.js`, `nav.js`, `messages.js` |
| change a colour, a size or a layer, or add a shared component | `webapp/src/styles/tokens.css` and `components/ui/` ([DESIGN.md](DESIGN.md)); `webapp/src/styles/voice.css` is the typographic layer |
| change what a search result shows for a page | the title: `webapp/src/lib/curriculum/pageTitle.js` (or `content/seo.json`); the description: `scripts/lib/describe.mjs` (or write a clear `> [!key]` sentence at the top of the module) |
| change how a share card looks or what it says | `site.config.json` (`shareImage`), `scripts/lib/shareImage.mjs`, `scripts/build/gen-share-images.mjs` |
| add an API route | `api/routes/<area>.js`; it must ask for a sign-in unless it is added to `PUBLIC` in `api/tests/access.test.js` |
| change the database | a new numbered file in `api/migrations/`, additive only ([api/README.md](../api/README.md)); apply it with `npm run db:migrate:remote` **before** deploying code that needs it |
| add a screen | a component under `webapp/src/components/<screen>/`, an entry in `webapp/src/lib/appPages.js` (and a built page if it should be indexed), a link in `config/nav.js`, a page in `site.config.json -> screenshots` |
| change what an article can contain, or the writing studio | `webapp/src/lib/blog/`, `components/studio/`, `lib/studio/` ([STUDIO.md](STUDIO.md)) |
| change where uploads are stored | `site.config.json` (`uploads`), and the same host in `webapp/public/_headers` and `webapp/index.html` (a test checks the three agree) |
| change the security headers | `webapp/public/_headers` (the browser tests apply them) |
