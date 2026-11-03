# Route and page inventory

Every address the app answers today, and which of them are promises (see [URL_MIGRATION_REGISTRY](../URL_MIGRATION_REGISTRY.md)).
The 837 registered addresses are the first group. Nothing in 2.0 may remove or move them without a permanent redirect.

## 1. Public pages the server answers (registered, permanent)

| Address | Count | Source |
|---|---|---|
| `/` | 1 | the app's home (landing for a first visit, dashboard after); prerendered |
| `/<curriculum>/` and `/<curriculum>/<track>/` | overviews | `content/<curriculum>/README.md` and track READMEs |
| `/<curriculum>/<track>/<module>/` | 817 pages in total across `backend` (190), `learn` (266), `genai` (315), `lld` (25), `system-design` (21) | prerendered from Markdown; 164 unwritten ones are `noindex` |
| `/privacy.html`, `/terms.html`, `/google9505317ffa2836de.html` | 3 | `webapp/public` |
| Files: `/sitemap.xml`, `/robots.txt`, `/videos.json`, `/search-index.json`, `/docs-index.json`, `/site-stats.json`, `/manifest.webmanifest`, `/sw.js`, icons, `/og-image.png`, the IndexNow key | 16 | build and `webapp/public` |

A lesson address is its folder path with a trailing slash. Old hash forms (`/#<lesson path>@<heading>`) are rewritten to it.

## 2. Pages added by the first revamp (real paths, server-drawn for crawlers)

| Address | Page | Indexed |
|---|---|---|
| `/blog/`, `/blog/?tag=&q=&sort=` | Explore Blogs | yes |
| `/blog/<slug>` | an article | yes once approved (new authors: `noindex` until approved) |
| `/authors/<handle>` | an author | yes |
| `/write`, `/write/<id>` | the writing studio | no (private) |
| `/sitemap-blogs.xml` | approved articles | n/a |

Prefixes `blog`, `authors`, `write` are reserved in `lib/appPages.js`, so no lesson can take them.

## 3. App screens in the hash (stay as they are; not indexed)

| Address | Screen |
|---|---|
| `/#__explore` | Explore (tags) |
| `/#__videos` | Videos |
| `/#__community` | Community: Questions |
| `/#__feed`, `/#__feed@<postId>` | Community: Posts; a post's own page |
| `/#__books`, `/#__suggestions` | Community: Resources, Ideas |
| `/#__saved`, `/#__notes`, `/#__bookmarks` | Saved (articles, notes, bookmarks) |
| `/#__workspace` | private workspace |
| `/#__admin` | admin dashboard (owner and admins) |
| `/#__design` | the living style guide |

## 4. API (`/api/*`, 81 routes)

Authorization is listed by `api/tests/access.test.js`: every route not on its `PUBLIC` list answers 401 to a visitor, and every
`/api/manage/*` route answers 403 to a signed-in non-admin.

| Area | Routes |
|---|---|
| auth | `GET auth/login`, `callback`, `me`, `logout` |
| study (private) | bookmarks (3), notes (3), progress (4), streak, reactions (2), `DELETE account` |
| comments | questions, activity, vote, edit, own delete, per-path list and post; admin: list, delete, mark answer |
| community | `GET community/counts`; feed (list, post, vote, upload; admin delete); books; suggestions; messages (post; admin list) |
| workspace | `workspace/pages` list, get, create, save, delete |
| blogs | public: list, tags, one, author; signed in: mine, saved, create, save, publish, unpublish, delete, like, bookmark, report, profile; admin: list, approve, hide, unhide, trust |
| assistant | `assistant/status`, `assistant/run` |
| admin | users, admins (grant, revoke), pageviews, usage, content (read, commit), image upload |
| tracking | `POST track` |

## 5. What 2.0 adds (proposed addresses, none colliding with the above)

New real-path prefixes would be reserved the same way: `/practice/`, `/design-lab/`, `/learn/`? **No**: `learn` is a curriculum
(`/learn/01-linux/…`, 266 registered pages), so the "Learn" navigation entry must stay a label over existing addresses, not a new
route. Candidates that are free: `/practice/…`, `/design-lab/…`, `/me` (hash screen is safer for private pages), `/paths/<id>`. Each
is added to `lib/appPages.js` with a reserved prefix and a unit test that no lesson uses it.
