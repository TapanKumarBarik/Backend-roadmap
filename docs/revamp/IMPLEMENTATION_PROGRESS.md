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

## Earlier revamp (docs/MODERNIZATION.md): phases 1 to 6, committed and, from 2026-11-03, on `origin/main`

Design system and shell; community blogs, studio, assistant, moderation; Community hub, comments and notifications, counts; search;
reading progress; "From the community"; performance budgets; accessibility and responsive audit; motion. Details and test counts there.
