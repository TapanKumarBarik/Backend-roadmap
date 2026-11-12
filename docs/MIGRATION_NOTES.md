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
| `0003_practice_and_design_lab.sql` | quiz attempts and answers, submissions and admin reviews, announcements, the audit log | Practice Center, admin notices and audit log (and the Design Lab, removed 2026-11) |
| `0004_peer_reviews.sql` | `peer_reviews`: feedback from other learners on a shared solution | the Design Lab (removed 2026-11; the rows are kept and are deleted with an account) |
| `0005_community_workflow.sql` | `post_classification` (kind and category), `post_versions` (history), `post_moderation` (a moderator's reason) | studio, articles list, moderation |
| `0006_workspace_hub.sql` | `workspace_meta` (what kind a workspace page is, and that kind's data), `revision_items` (the lessons on a revision list) | the private workspace: folders, study plans, revision lists, saved diagrams |

**Apply them before the code that needs them is deployed:** `npm run db:migrate:remote`. The deploy workflow's smoke test reads
`/api/announcements` and `/api/practice/catalog`, so a forgotten 0003 fails the deploy instead of failing for visitors. Locally,
`npm run db:migrate` applies them to the local database.

**Nothing to back-fill.** A post with no `post_classification` row is an article in General; a post with no versions has none; a post with no
moderation row was taken down without a reason. Old data reads correctly without being touched.

**The workspace hub (0006).** `workspace_pages` (0001) is not altered: a page's kind lives beside it in `workspace_meta` (`folder`, `plan`,
`revision`, `diagram`; a page with no row there is a plain text page, so every page made before the migration reads correctly with nothing to
back-fill). A plan keeps its steps, lessons and target date as JSON in `workspace_meta.data` (a lesson's tick is *not* stored: it is the
reader's real lesson progress), a diagram its Mermaid source. A revision list is a page of kind `revision`; its lessons, with the day each was
last revised and how many times, are rows of `revision_items`. The lesson page's "Add to revision list" button posts to
`/api/workspace/revision`, which makes the person's first list if they have none. Every route is the owner's alone (a page that is not yours
is "not found"), what is sent is rebuilt from an allow-list and size-limited (`webapp/src/lib/workspace/kinds.js`, shared by the API and the
screens). A diagram is stored as `{ source }` (Mermaid text the person writes: this is how every diagram page was, and a page in text mode is still exactly
that) or, when it is *drawn* in the visual editor, as `{ source, mode: 'visual', model }` with `model = { nodes: [{ id, label, shape, x, y }], edges: [{ id, from, to,
label, dashed }] }`. No migration: the kind is the same and `data` is JSON, so an old diagram reads as text. `shape` is one of `rect`, `rounded`, `decision`, `database`,
`circle`; ids are `[A-Za-z0-9_-]{1,40}` and unique in their list; positions are whole numbers within ±5000; there are at most 60 boxes and 120 arrows, box words up to
60 characters and arrow words up to 40; an arrow must join two boxes that are in the drawing. The API rebuilds the model from that allow-list
(`cleanDiagramModel` in `kinds.js`, shared with the editor) and **writes `source` itself from the model** (`toMermaid` in `diagramMermaid.js`: ids `n1…`, every label in
quotes, with the characters Mermaid reads as syntax (hash, double quote, less-than, greater-than, ampersand, backtick, percent, backslash) written as entity codes), ignoring any source the client sent, so the two cannot disagree; a drawing whose text would pass the
20,000 character source limit is refused. "Convert to text" saves `{ source }` and drops the model. Nothing in the API changed for dragging pages in the tree: a drop
is the same `PUT /api/workspace/pages/:id { parentId, order }` that "Move to…" and the row menu use (the order is the midpoint between the two new neighbours; when
two neighbours have no room left the tree first renumbers the siblings with the same call), and the server's ownership, parent-kind and cycle checks apply as before.
Behaviour that changed for the *old* routes, all in the direction of refusing what was never meant to work: a page's parent must
exist, be yours, and be a page or a folder (it used to accept any string); deleting a page that is not yours answers 404 instead of an empty
success; a person can keep at most 1000 pages.

**Account deletion** also removes the workspace's pages, their kinds and data, and every revision lesson (`api/lib/workspaceData.js`), and
removes what the other new tables hold for that person: quiz tries, submissions, the reviews of them, the feedback they gave and
received, their posts' classification, versions and moderation notes (`api/lib/practiceData.js`, `api/lib/blogData.js`). The privacy page says so.

## Where content lives

- **Lessons, quizzes, exercises and interview sets are files in git** (`content/`). What people *did* with them is in the database.
- `api/generated/practice-content.json` is what the API serves the practice content from (a Pages Function cannot read the repository). It is
  built by `npm run practice:build`. `npm run check` fails locally when the committed copy is stale. CI builds it first (`.github/actions/verify`), so
  the admin editor can commit a quiz without regenerating anything and the deploy still carries it.
- Quizzes, exercises, interview sets and challenges can be edited in the browser (Admin, Practice, "Edit the content"). The server checks the file
  (`webapp/src/lib/practice/validate.js`, and that the lesson it names exists) before it commits it with the site's GitHub token.
- **Three more files can be edited in the browser** (Admin, Site; [`ADMIN_CONTENT.md`](ADMIN_CONTENT.md)): `content/paths.json` (the learning paths),
  `content/videos.json` (the playlists, and which module each video belongs to) and the new, optional `content/seo.json` (a hand-written title and
  description for a module's page). Same mechanism and same strict allow-list as the practice content, validated on the server with the rules the
  command-line checks use (`npm run check:paths`, `check:videos`, `check:seo`). `dist/docs-index.json` gained a top-level `seo` map (the overrides),
  and the build writes `dist/seo-defaults.json` (the generated descriptions, for the SEO screen). Both are additions; nothing was renamed or removed.
  A module's page without an override is built exactly as before.

## Addresses

Nothing published before the revamp moved. `docs/url-registry.tsv` still holds every one of the 837 addresses and `npm run check:urls` holds the build to
them. New, built as files at deploy time (see [`URL_MIGRATION_REGISTRY.md`](URL_MIGRATION_REGISTRY.md)): `/paths/`, `/paths/<id>/`, `/videos/`,
`/practice/…`, `/design-lab/…`. The Design Lab was `/lab/…` for about a day; `webapp/public/_redirects` sends it to `/design-lab/…` permanently.

Screens that need no address of their own stay in the hash (`/#__me`, `/#__admin`, `/#__saved` …). An old hash address for a screen that now has a
real address (`/#__videos`, `/#__practice@quiz/x`) is rewritten by the app to the real one.

## Rolling back

Code can be reverted freely: the new tables are read only by the new code, and the old code ignores them. Do not drop the tables; they hold
people's quiz tries and submissions.
