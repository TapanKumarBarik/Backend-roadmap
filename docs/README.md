# Documentation

Start with [ARCHITECTURE.md](ARCHITECTURE.md): what the repository is made of, how a page gets from `content/` to a reader, and a table of
"I want to change X, so I edit Y". The rest is grouped by what you are doing.

## Running and changing it

| Document | For |
|---|---|
| [LOCAL-SETUP.md](LOCAL-SETUP.md) | Running the app and the API on your machine; the commands |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How it fits together; the gates; where to change what |
| [DESIGN.md](DESIGN.md) | The design system (tokens, components, the typographic layer) and the style guide at `/#__design` |
| [api/README.md](../api/README.md) | The API: routes, the database, how to change the schema safely |

## Writing and managing content

| Document | For |
|---|---|
| [IMAGES.md](IMAGES.md) | Adding pictures to a lesson |
| [VIDEOS.md](VIDEOS.md) | The YouTube videos, how they attach to modules, `npm run videos:sync` |
| [PRACTICE.md](PRACTICE.md) | Quizzes, exercises, interview sets and design challenges: the files, the rules, how an admin edits them |
| [ADMIN_CONTENT.md](ADMIN_CONTENT.md) | What an admin can edit in the browser (paths, videos, SEO) and how it is saved |
| [STUDIO.md](STUDIO.md) | The community writing studio |
| [ROADMAP.md](ROADMAP.md) | What is planned |

## Addresses, SEO and quality

| Document | For |
|---|---|
| [URL_MIGRATION_REGISTRY.md](URL_MIGRATION_REGISTRY.md) | The rule that a published address keeps working, and how it is checked (`docs/url-registry.tsv`) |
| [URL_TEST_REPORT.md](URL_TEST_REPORT.md) | The last run of the address check |
| [TESTING_REPORT.md](TESTING_REPORT.md) | What each layer of tests guards, with the numbers |
| [MIGRATION_NOTES.md](MIGRATION_NOTES.md) | What 2.0 changed in the database and the addresses, and what to run |

## The 2.0 project record

These are the working papers of the 2.0 revamp, kept for the reasoning behind decisions: the plan ([MODERNIZATION.md](MODERNIZATION.md),
[revamp/REVAMP_IMPLEMENTATION_PLAN.md](revamp/REVAMP_IMPLEMENTATION_PLAN.md)), the audit ([revamp/AUDIT_REPORT.md](revamp/AUDIT_REPORT.md)),
inventories ([features](revamp/EXISTING_FEATURES_INVENTORY.md), [routes](revamp/ROUTE_AND_PAGE_INVENTORY.md),
[data](revamp/DATA_MODEL_INVENTORY.md)), progress ([revamp/IMPLEMENTATION_PROGRESS.md](revamp/IMPLEMENTATION_PROGRESS.md)) and the list of
practice content that a person should still read ([revamp/CONTENT_REVIEW.md](revamp/CONTENT_REVIEW.md)). They describe a moment in time;
ARCHITECTURE.md is the one that is kept current.

[PRIVACY-TERMS-DRAFT.md](PRIVACY-TERMS-DRAFT.md) is the wording behind `webapp/public/privacy.html` and `terms.html`.
