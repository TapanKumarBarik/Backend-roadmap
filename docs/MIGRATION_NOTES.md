# Migration notes

What changed under the database and the addresses for BackendRoadmap 2.0, what to run, and what is safe to leave alone. Every change here is
additive: no table, column, row, route or published address was removed or renamed.

## Database

Migrations are numbered files in [`api/migrations/`](../api/migrations/). `api/tests/migrations.test.js` runs each one twice on an empty
database, so a migration is written with `CREATE TABLE IF NOT EXISTS` and **cannot alter an existing table**: new information goes in new
tables beside the old ones.

| Migration | Adds | Used by |
|---|---|---|
| `0002_blogs.sql` | author profiles, posts, tags, likes, bookmarks, reports | community articles, the studio |
| `0003_practice_and_design_lab.sql` | quiz attempts and answers, submissions and admin reviews, announcements, the audit log | Practice Center, Design Lab, admin notices and audit log |
| `0004_peer_reviews.sql` | `peer_reviews`: feedback from other learners on a shared solution | Design Lab |
| `0005_community_workflow.sql` | `post_classification` (kind and category), `post_versions` (history), `post_moderation` (a moderator's reason) | studio, articles list, moderation |

**Apply them before the code that needs them is deployed:** `npm run db:migrate:remote`. The deploy workflow's smoke test reads
`/api/announcements` and `/api/practice/catalog`, so a forgotten 0003 fails the deploy instead of failing for visitors. Locally,
`npm run db:migrate` applies them to the local database.

**Nothing to back-fill.** A post with no `post_classification` row is an article in General; a post with no versions has none; a post with no
moderation row was taken down without a reason. Old data reads correctly without being touched.

**Account deletion** removes what the new tables hold for that person: quiz tries, submissions, the reviews of them, the feedback they gave and
received, their posts' classification, versions and moderation notes (`api/lib/practiceData.js`, `api/lib/blogData.js`). The privacy page says so.

## Where content lives

- **Lessons, quizzes, exercises, interview sets and design challenges are files in git** (`content/`). What people *did* with them is in the database.
- `api/generated/practice-content.json` is what the API serves the practice content from (a Pages Function cannot read the repository). It is
  built by `npm run practice:build`. `npm run check` fails locally when the committed copy is stale. CI builds it first (`.github/actions/verify`), so
  the admin editor can commit a quiz without regenerating anything and the deploy still carries it.
- Quizzes, exercises, interview sets and challenges can be edited in the browser (Admin, Practice, "Edit the content"). The server checks the file
  (`webapp/src/lib/practice/validate.js`, and that the lesson it names exists) before it commits it with the site's GitHub token.

## Addresses

Nothing published before the revamp moved. `docs/url-registry.tsv` still holds every one of the 837 addresses and `npm run check:urls` holds the build to
them. New, built as files at deploy time (see [`URL_MIGRATION_REGISTRY.md`](URL_MIGRATION_REGISTRY.md)): `/paths/`, `/paths/<id>/`, `/videos/`,
`/practice/…`, `/design-lab/…`. The Design Lab was `/lab/…` for about a day; `webapp/public/_redirects` sends it to `/design-lab/…` permanently.

Screens that need no address of their own stay in the hash (`/#__me`, `/#__admin`, `/#__saved` …). An old hash address for a screen that now has a
real address (`/#__videos`, `/#__practice@quiz/x`) is rewritten by the app to the real one.

## Rolling back

Code can be reverted freely: the new tables are read only by the new code, and the old code ignores them. Do not drop the tables; they hold
people's quiz tries and submissions.
