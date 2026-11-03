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

## Earlier revamp (docs/MODERNIZATION.md): phases 1 to 6, committed and, from 2026-11-03, on `origin/main`

Design system and shell; community blogs, studio, assistant, moderation; Community hub, comments and notifications, counts; search;
reading progress; "From the community"; performance budgets; accessibility and responsive audit; motion. Details and test counts there.
