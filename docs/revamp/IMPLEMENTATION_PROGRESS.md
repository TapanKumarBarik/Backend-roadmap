# Implementation progress

Updated after every phase: what was implemented, files, features preserved, tests, issues, remaining.

## Phase 0: audit (2026-11-03)

- **Implemented:** AUDIT_REPORT, EXISTING_FEATURES_INVENTORY, ROUTE_AND_PAGE_INVENTORY, DATA_MODEL_INVENTORY, REVAMP_IMPLEMENTATION_PLAN
  (this folder), `docs/URL_MIGRATION_REGISTRY.md`, `docs/url-registry.tsv`, `npm run check:urls` and `check:urls:live`.
- **Files changed:** documents, `scripts/lib/{publicUrls,urlCheck,urlLive}.mjs` (+ tests), `scripts/check/check-urls.mjs`,
  `scripts/maintain/{check-urls-live,register-urls}.mjs`, `webapp/public/_redirects` (empty), `package.json`, the CI verify action.
- **Preserved:** everything; no feature, route, table or content was touched. 837 of 837 registered addresses answer as before.
- **Tests:** 13 unit tests for the URL checks; the live checker ran over all 837 addresses of a local preview with no problem.
- **Issues:** none blocking. The brief overlaps the first revamp heavily; the plan extends it.
- **Remaining:** owner review of the plan and the four decisions at the end of REVAMP_IMPLEMENTATION_PLAN.

## Phases 5 and 6: Practice Center, Design Lab, My Learning, paths (2026-11-03)

- **Implemented:** the content in git (`content/practice`, `content/design-lab`: 4 quizzes, 3 exercises, 3 interview sets, 10 design
  challenges, validated by `scripts/lib/practice.mjs`, built into `api/generated/practice-content.json`, `npm run check` fails if stale);
  migration 0003 (quiz attempts, submissions with draft/submitted/reviewed and explicit sharing, reviews, announcements, audit log);
  the API (`api/routes/practice.js`: answers scored on the server, the reference solution only after a submission); the screens
  (Practice, Design Lab with a submission workspace and Mermaid preview, My Learning, a page for each learning path, path difficulty,
  prerequisites and skills in `content/paths.json`); admin Practice (figures, submission review), Notices and Audit log sections;
  the notice bar; the practice strip on the landing page and dashboard; the practice that goes with a lesson, at its foot; quizzes and
  challenges in the command palette; reading options (text size, line width) on a lesson; discussion under each design challenge.
- **Real addresses** for the paths, videos, practice items and challenges (see `docs/URL_MIGRATION_REGISTRY.md`, item 9): built as files,
  in the sitemap, linked from the home page, with structured data (Course, FAQPage, LearningResource, CollectionPage).
- **Videos:** 50 more lectures (Phase 2 #42 to #90, Phase 3 #1), a Phase 3 playlist, and a sync that reads whole playlists.
- **Tests:** 12 unit tests added in `scripts/lib` and `api/tests` for practice and the listing pages; 125 browser tests in all
  (`tests/e2e/practice.e2e.mjs`: quiz flow, answers not in the page, design workspace, My Learning, paths, notices, admin review, real
  pages, lesson strip, palette, reading options); the audit covers the new screens at every width. The deploy smoke test now reads
  `/api/announcements` and `/api/practice/catalog`, so a forgotten migration 0003 fails the deploy.
- **Found by the audit:** the comment composer's textarea had no accessible name; it has one now.
- **Remaining:** apply migration 0003 before pushing (`npm run db:migrate:remote`); owner decisions in REVAMP_IMPLEMENTATION_PLAN; own-post
  edit and delete in the community tabs; paging the feed; a general review queue; a keyboard-operable module tree; a screen-reader pass.

## 2.0 second batch: everything the brief still asked for that could be built (2026-11-03)

- **Implemented**
  - *Addresses:* the Design Lab is at `/design-lab/…` as the product spec says (`/lab/…` redirects, permanently).
  - *Home:* the new promise and calls to action ("Explore Learning Paths", "Start Learning"), a practice strip with quizzes **and design challenges**, and
    "Popular this month" from the site's own page views (aggregated, public, shown only when enough lessons have been read to be a real list).
  - *Learning paths:* progress and "Completed" on each card, steps that open and close, difficulty and prerequisites on each page.
  - *Videos:* 110 lectures in three playlists, a sync that reads whole playlists, and "Next video" under each lecture.
  - *Practice:* 20 more quizzes (24 in all), 4 more exercises, 4 more interview sets, 4 more design challenges: with Food Delivery, Movie Ticket Booking,
    Social Media Feed and E-commerce Platform, all 7 low-level and 7 high-level challenges of the product spec are in. Timed mode, retry of the
    missed questions, "Where to practise" on My Learning (weak areas by topic).
  - *Design Lab:* **peer feedback** on shared solutions (rate-limited; the author reads it with their own work; removable by its writer or an admin).
  - *Community:* contribution **kinds** (article, study notes, tutorial, project showcase, LLD design, HLD design, quiz) and **categories**, both chosen in the
    studio and filterable on the list; **version history** with restore; a moderator's **reason** shown to the author, and a state (draft, scheduled,
    live-waiting-for-approval, approved, taken down); **edit and delete your own** posts, resources and ideas; the feed in pages of twenty.
  - *Admin:* edit quizzes, exercises, interview sets and design challenges in the browser (validated before it commits); Notices; Audit log; reasons on takedowns.
  - *Quality:* the module tree is one Tab stop with arrow-key navigation and real buttons (open/close, progress); a fix for a comment box with no accessible name;
    code blocks and diagrams that are a little too wide shrink to fit and a wider one shows a fade and scrolls from the keyboard; reading options.
  - *Tooling:* `npm run ci:linux` (the CI steps on Linux in Docker), diagrams in practice content are checked, the admin's practice edits are rebuilt in CI.
- **Files changed:** see the commits; the shape of the data is in `docs/MIGRATION_NOTES.md`, the content in `docs/PRACTICE.md`, the tests in `docs/TESTING_REPORT.md`.
- **Preserved:** every feature, address and table. Migrations 0004 and 0005 add tables only. 837 of 837 registered addresses still answer.
- **Issues found and fixed on the way:** three browser tests that depended on fonts or on `localhost` (found by running on Linux); a false "no text" report from the
  live address checker (a host-injected script after the page); an unlabelled comment textarea.
- **Remaining**
  - *Admin screens still in git:* learning paths (`content/paths.json`), SEO metadata and the YouTube registry (`content/videos.json`, `npm run videos:sync`).
  - *Not built:* a top navigation bar (the left rail carries the six destinations), custom drag-and-drop diagrams (Mermaid and uploads instead), a community
    moderation queue for kinds other than articles (they share the articles' queue), study plans and folders in the Workspace.
  - *Not done by a person:* a screen-reader pass; Lighthouse and real-device runs.
  - *Needs a reader:* the quiz and challenge drafts. Each draft came with a list of statements worth double-checking; they are collected in `docs/revamp/CONTENT_REVIEW.md`.

## 2.0 third batch: the rest of the "not done" list (2026-11-03)

- **Implemented**
  - *Top navigation:* on a window 1280 px or wider the six places (Learn, Explore, Practice, Design Lab, Community, My Learning) are links in the top bar, with
    the current place marked and the Community "something new" dot; the left rail keeps the others (videos, articles, saved, workspace, admin). Below 1280 px the rail
    carries all of them, and on a phone it is the bottom bar as before. (`config/nav.js`, `components/layout/MainNav.jsx`.)
  - *Admin, Site* (`docs/ADMIN_CONTENT.md`): edit the **learning paths** (a form: steps picked from the real folders, order, prerequisites, skills), the **YouTube registry**
    (playlists, and the module each video belongs to, searchable, with a flag for videos without one) and **SEO** (a hand-written title and description for a module's
    page, applied when the site is built and in the browser tab). All commit to the repository after a server-side check with the rules the command-line checks use.
  - *Workspace as a personal hub* (migration 0006): folders (with a keyboard-operable "Move to…"), study plans from a learning path or your own list (a lesson's tick is
    your real progress), revision lists (most overdue first, an "Add to revision list" button on each lesson), saved Mermaid diagrams, a clear "Private" note on every kind
    of page, and "Copy text into a new article draft". The tree, the plans and the lists are lazy-loaded, so the first page stays inside its size budget.
  - *Lighthouse:* run on six pages (accessibility 100, SEO 100, best practices 96, performance 82 to 90). Fixed: the search button had no name at phone width, five vague
    "Start" links, the module page drew 8,700 elements (now 1,300; blocking time 290 to 80 ms), the first video thumbnails were lazy. `npm run lighthouse` repeats it.
- **Tests:** the combined suite on Linux is in `docs/TESTING_REPORT.md`; the new browser tests are `tests/e2e/workspace.e2e.mjs` (10) and `tests/e2e/site-admin.e2e.mjs` (4),
  and the navigation test in `design.e2e.mjs`.
- **Remaining**
  - *Needs a person:* a screen-reader pass; real-device testing; the new workspace sentence for the privacy page (a draft is at the end of `docs/PRIVACY-TERMS-DRAFT.md`;
    the live page is unchanged until it is approved).
  - *Needs a reader:* the quiz and challenge drafts (`docs/revamp/CONTENT_REVIEW.md`).
  - *Not built:* custom drag-and-drop diagram editor; drag-and-drop in the workspace tree (the keyboard "Move to…" is there); admin screens for site configuration beyond
    paths, videos and SEO (announcements and practice content already have theirs).
- **Before deploying:** apply migrations 0004, 0005 and 0006 (`npm run db:migrate:remote`).

## Earlier revamp (docs/MODERNIZATION.md): phases 1 to 6, committed and, from 2026-11-03, on `origin/main`

Design system and shell; community blogs, studio, assistant, moderation; Community hub, comments and notifications, counts; search;
reading progress; "From the community"; performance budgets; accessibility and responsive audit; motion. Details and test counts there.
