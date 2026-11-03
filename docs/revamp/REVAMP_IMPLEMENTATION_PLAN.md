# BackendRoadmap 2.0: implementation plan

Basis: [AUDIT_REPORT](AUDIT_REPORT.md). The brief's phases are kept, each marked with what is already done. Every phase ends with
build, unit and browser tests, `check:urls`, `check:bundle` and the accessibility audit green, existing features checked, docs updated
([IMPLEMENTATION_PROGRESS](IMPLEMENTATION_PROGRESS.md)). **Release-blocking rule: no public address is lost** (URL registry).

Working agreements: additive migrations only, applied by the owner (`npm run db:migrate:remote`) before the code that needs them ships;
nothing is pushed or deployed without the owner's word; new routes get the access test, the account-deletion list, reserved prefixes
and a smoke-test call; no fake data, no dead buttons.

| Phase | Brief | State | What is left |
|---|---|---|---|
| 0 Audit | five documents | **done** (these) | owner review |
| 1 Design system | tokens, components, light/dark, style guide | **done** (`docs/DESIGN.md`, `/#__design`) | `DESIGN_SYSTEM.md` can be this file under the brief's name; add components the new domains need (Quiz option, Diff, Stepper) |
| 2 Navigation, homepage | six destinations, global search, homepage sections | rail, palette, landing, dashboard, community strip **done** | relabel the rail to Explore, Learn, Practice, Design Lab, Community, My Learning; homepage sections for domains, popular lessons, quizzes and challenges once those exist |
| 3 Learning paths | Explore with filters, path detail | picker, 8 paths with steps **done** | a path page (`/paths/<id>`), difficulty, prerequisites, skills as fields in `content/paths.json`; Explore filters |
| 4 Lesson experience, authoring | three-column reading, preferences, related items, authoring, version history | reading, notes, bookmark, collapsible panels, studio **done** | reading preferences (font size, width, stored locally), related quizzes and challenges, a lesson authoring path in admin (git history is the version history) |
| 5 Practice Center | quizzes, exercises, interview prep | not started | see below |
| 6 Design Lab | LLD and HLD challenges, submissions | not started | see below |
| 7 Community | more types, review states, moderation | articles, posts, questions, ideas, resources, moderation of articles **done** | `content_reviews` and a general queue; tutorials, study notes and showcases as article categories rather than new tables |
| 8 My Learning, Workspace | one page of the person's learning | data exists | `/#__me`: progress, active paths, continue, bookmarks, notes, attempts, submissions, activity, next steps |
| 9 Admin | quiz bank, challenges, submissions, roles, SEO, announcements, audit log | users, admins, content, articles, analytics **done** | the new sections |
| 10 SEO, performance, accessibility, release | | budgets, audit, URL gate, sitemap, JSON-LD **done** | new pages' metadata, manual screen-reader pass, staging run of `check:urls:live` |

## Phase 5: Practice Center

- Content in git: `content/practice/quizzes/<slug>.json` (title, topic, difficulty, questions of type `single`, `multiple`, `truefalse`,
  each with options, the correct answers and an explanation), `content/practice/exercises/<slug>.md`, `content/practice/interview/<slug>.md`.
  A check validates every file (like `check-paths`), so a broken quiz fails CI.
- API: `GET /practice/quizzes` (public list, topic filter), `GET /practice/quizzes/:slug` (questions **without** answers),
  `POST /practice/quizzes/:slug/attempts` (server scores, so answers are never sent to the browser), `GET /practice/attempts` (private history).
- Tables: `quiz_attempts`, `quiz_answers`. Exercises: `submissions` (`kind: exercise`) with written text and an optional code attachment.
- UI: quiz runner with keyboard operation, scoring, explanations, attempt history, topic filters; exercise page reusing the studio editor.
- Tests: scoring (all three question types), answers never in the public payload, ownership of attempts, account deletion.

## Phase 6: Design Lab

- Content in git: `content/design-lab/lld/<slug>/README.md` and `.../hld/<slug>/README.md` for the ten named challenges (problem,
  functional and non-functional requirements, constraints, deliverables, reference solution after submission). Linked from the existing
  `lld` and `system-design` lessons.
- Submissions: the studio editor with Mermaid blocks (already supported), optional diagram upload through the existing upload route,
  an LLD section for class responsibilities and patterns, an HLD section for APIs, data flows and trade-offs; drafts, edit, submit.
- Review and discussion: `submission_reviews`, comments under `challenge:<slug>` (reuse), public sharing is opt-in.
- Mermaid output is sanitized with the same discipline as articles; uploads are images only from the upload origin.

## Order of work, with sizes

1. Phase 2/4 polish that needs no data: rail relabel, reading preferences (small).
2. Phase 3: path pages, difficulty, prerequisites, Explore filters (medium; content fields plus a screen).
3. Phase 5 quizzes (large), then exercises (medium).
4. Phase 6 (large): challenges content, submission workspace, review.
5. Phase 8 My Learning (medium), Phase 9 admin sections (medium, grows with each domain), Phase 7 general review queue (medium).
6. Phase 10 release: staging, `check:urls:live`, sitemap comparison.

Each of 3 to 6 is a separate migration (`0003_practice.sql`, `0004_design_lab.sql`, …) and a separate commit series that can ship or be
reverted on its own.

## Decisions needed from the owner before Phase 5

1. Quiz and challenge content: authored by you in git (recommended) or also by admins in the browser?
2. Are submissions private by default with an explicit "share" (recommended), or public on submit?
3. Difficulty and prerequisites for the 8 paths: you supply them, or I propose from the module order for you to correct?
4. The rail label "Learn": it would lead to the dashboard and curricula; the address `/learn/…` stays the Linux and Git curriculum.
