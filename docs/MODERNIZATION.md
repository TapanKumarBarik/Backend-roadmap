# Modernization plan: a design system, community blogs and a writing studio

Status: **Phase 1 (audit and plan) is done**, 2026-11-02. The phases after it say what "done" means for each, so any of them can be built, reviewed and shipped on its own. Nothing here changes a curriculum URL, a progress key or an existing endpoint.

## The goal, and what stays

BackendRoadmap is a place to learn. This makes it a place to learn **and to write**: a signed-in reader can write a technical article in a calm editor, publish it, and have the community read, like, bookmark and discuss it, while the whole site gets a consistent, modern look and feel.

What stays, on purpose:

- **The Blueprint identity.** Paper, ink, hairlines, and one amber accent spent on state (progress, "in progress", the route in the logo). It is already recognisable and is documented at the top of `webapp/src/styles/global.css`. This work completes it (type, spacing, components, motion) instead of replacing it.
- No UI library, no animation library, React 18, the Node-only build, `site.config.json` as the one config. New dependencies only where the feature cannot be built without them (a few more Tiptap packages for the studio).
- Every existing screen, URL and API route keeps working. The browser tests' selectors (`#sidebar a.name`, `#pager`, `.vid-*`, `.ws-*`, `button.bookmark-btn`) keep working.

## What the audit found

Four read-only audits of the API and data, the shell and styles, the social screens and the editor, plus a visual review of 20 screens (light, dark, mobile). The facts that shape the work, most important first:

| # | Finding | Consequence |
|---|---|---|
| 1 | Only curriculum modules have real URLs; every screen lives in the hash (`useHashRoute.js`). A path that is not a prerendered page returns **404** (checked live: `/blog/x`, `/write`, `/authors/x`), because `404.html` exists, there is no `_redirects`, and `_routes.json` runs code only for `/api/*`. | Blogs need real paths, a route table in the router, and Pages Functions that serve them (with the article in the HTML for crawlers and link previews). |
| 2 | A user is a Google `sub` plus email, name and picture, written at sign-in. No handle, bio or public profile. Public payloads carry the `sub` and a name snapshot; the picture is never public and `privacy.html` says it is shown back to you only. | Authors need their own public identity (handle, name, optional avatar) and the `sub` must never be public. The privacy and terms pages need a short update. |
| 3 | `comments.path` is free text; the feed already uses `feed:<id>`. But `/comments/questions` hides only `feed:%`, and the account menu shows the raw `feed:` string. "Newest" actually sorts oldest first. Comments are plain text, one reply level. | Blog comments reuse the table as `blog:<id>`, after fixing those three bugs. |
| 4 | The Workspace already has a Tiptap 3.31 editor: a fixed toolbar, a drag handle, image upload (5 MB, base64 over JSON, sharing the feed's 10-per-10-minutes limit), JSON stored as TEXT (200 KB cap). Missing: slash and floating menus, code-block language and highlighting, callouts, divider and undo buttons, video and embeds, image drop and paste, counts, full-screen, preview. Autosave drops edits under 700 ms old when you leave and shows "Saved" before the server has answered. | The studio is built on this stack, with the autosave rewritten honestly. |
| 5 | The curriculum renderer is unsanitised (its content is trusted). `renderUserMarkdown` strips images, tables and code classes. DOMPurify does nothing without a DOM, so it cannot run in a Worker. | Blog posts are stored as ProseMirror JSON, validated against an allow-list, and rendered by a pure, DOM-free module. That is the safe design and the one SEO needs. |
| 6 | The main security boundary is stored XSS: an admin session can call `/api/manage/content` and `/api/manage/admins`. `GET /api/auth/logout` and `GET /api/streak` change state, and `img-src 'self'` allows same-origin images, so an `<img src="/api/auth/logout">` in user content would log readers out. The OAuth `redirect` parameter is not validated. | The renderer only allows images from our upload host and YouTube video ids; user links get `rel="nofollow ugc noopener"`; the redirect is validated. Hostile-document tests are part of Phase 3a. |
| 7 | No pagination anywhere. The feed returns 200 posts and the app downloads the whole feed and question list on every page load just to draw two "new" dots. | Cursor pagination from the first blog endpoint, and a small counts endpoint, before blog traffic arrives. |
| 8 | The tokens are good (colour, radii, shadows, motion durations; dark mode validated), but there are no spacing, type-scale or z-index tokens and no shared components: 83 button classes, about 11 input recipes, about 25 card recipes, modals without a focus trap, toasts without `aria-live`, 9 `confirm()` and 1 `alert()`. No global `:focus-visible`, no `<main>`. `--fg-subtle` is 3.1:1 on paper. `global.css` is 2,821 lines, the last 780 an override layer holding 150 of its 152 `!important`. | Phase 2 adds the missing tokens and a small set of real components, then moves screens onto them as they are touched. |
| 9 | Navigation: a 10-item icon-only rail (late items pop in), a 9-item mobile bottom bar, and "Explore" meaning the tag browser. Four rail items (Feed, Community, Books, Suggestions) are community screens that are mostly empty. | A labelled rail with groups, a mobile bar of five plus "More", and one Community destination with tabs. |
| 10 | Motion: tokens exist but only the landing page and videos use them; there are no page transitions. One global reduced-motion rule (good). | A small set of motion recipes on those tokens, all off under reduced motion. |
| 11 | Migrations are applied by hand (`npm run db:migrate:remote`); a forgotten one deploys green because the smoke test only calls `/api/auth/me`. The migration test re-runs every migration, so a migration can only add tables (an `ALTER ... ADD COLUMN` would fail it). | `0002` creates new tables only. The deploy smoke test also calls a blog endpoint, so a missing migration fails the run. |
| 12 | Other bugs found: signing in from a hash screen returns to `/`; signed-in readers see "Sign in with Google" until `/api/auth/me` answers; account deletion leaves `users`, books, suggestions, feed text and workspace pages; the skip link goes through the hash router. | Fixed in the phase that touches each. |

## Decisions

Each has a default, so work does not wait; each can be overridden before its phase starts.

| | Decision | Why |
|---|---|---|
| D1 | Posts live in new tables. Comments reuse `comments` (`path = 'blog:<id>'`). Likes and bookmarks are new tables. | One comment system, replies, votes and moderation already exist. |
| D2 | A document is ProseMirror JSON, validated and rendered by one pure module, `webapp/src/lib/blog/`, shared by the API, the Pages Function, the app and the tests. | One implementation, no DOM needed, nothing but allow-listed nodes can reach a reader. |
| D3 | Real URLs: `/blog/`, `/blog/<slug>`, `/authors/<handle>`, `/write`, `/write/<id>`. Pages Functions serve them; `_routes.json` lists them. | SEO and link previews; direct loads must not 404. |
| D4 | Scheduled publishing is a time gate on read (`publish_at <= now`). No cron. | Pages cannot run cron, and a read-time gate cannot miss. |
| D5 | Moderation: a new author's posts are live but `noindex` and out of the sitemap until an admin trusts the author or approves the post. A Report button, an admin queue, hide and unpublish. | Open publishing without letting spam on a new domain damage how search engines see the curriculum. |
| D6 | The writing assistant sits behind a provider seam on the server. Default **Cloudflare Workers AI** (one binding line in `wrangler.jsonc`, a free daily allowance, no secret); **Anthropic** optional through a secret; the feature is hidden when neither is configured. It never edits the document: every suggestion is shown as a preview and applied only on confirm; a per-user daily cap. | Optional, no key to leak, no surprise bill. |
| D7 | Animation is CSS, the Web Animations API and View Transitions where supported. No Framer Motion. | It would add about 35 to 50 KB gzipped for effects CSS does well; the site already weighs React 18 (not 19) for the same reason. |
| D8 | System sans for the interface and a system serif stack for long-form reading. No web font yet. | Free and fast; `font-src 'self'` allows adding one later. |
| D9 | Feed stays, renamed **Posts**, as one tab of a **Community** hub with Questions, Resources (Books) and Ideas (Suggestions). Old links keep working. | Four mostly empty rail items become one place; nothing is removed. |
| D10 | Public author identity is a handle, a display name and an optional avatar the author chooses to show. The Google `sub` is never exposed. | Privacy, and `/authors/<handle>` needs a stable public name. |

## Architecture

**Data** (`api/migrations/0002_blogs.sql`, tables only, `IF NOT EXISTS`):

| Table | Holds |
|---|---|
| `author_profiles` | `user_id`, unique `handle`, `name`, `bio`, `website`, `avatar_url`, `trusted`, timestamps |
| `blog_posts` | `id`, `author_id`, unique `slug`, `title`, `subtitle`, `excerpt`, `cover_url`, `content` (JSON), `body_text` (plain, for search), `words`, `minutes`, `status` (`draft` or `published`), `publish_at`, `approved`, `hidden`, `likes`, timestamps |
| `blog_tags` | `post_id`, `tag` |
| `blog_likes`, `blog_bookmarks` | `post_id`, `user_id`, `created_at` |
| `blog_reports` | `id`, target, `user_id`, `reason`, `created_at` |

A post shows as **Draft** (status `draft`), **Scheduled** (published with a future `publish_at`) or **Published**. Upload files reuse `/api/feed/upload` with its own rate bucket.

**API** (`api/routes/blogs.js`, mounted in `api/app.js`): public reads (`GET /blogs` with `q`, `tag`, `author`, `sort=popular` and a `cursor`; `/blogs/tags`; `/blogs/:slug`; `/authors/:handle`), signed-in writes (`POST /blogs` for a draft, `PUT /blogs/:id` with a `baseUpdatedAt` check so a second tab cannot overwrite silently, `/publish` with an optional `publishAt`, `/unpublish`, delete own, `/like`, `/bookmark`, `/report`, `GET` and `PUT /me/profile`, `GET /blogs/mine[/:id]`), the assistant (3d), and admin routes under `/api/manage/` (`blogs` with `filter=pending|reported|hidden`, `approve`, `hide`, `unhide`, and `authors/:handle/trust`). An author-only route answers "not found" to anyone else. Each new route follows the access-test conventions (signed in unless on the `PUBLIC` list). What removes a post, or an account's blog data, is one list in `api/lib/blogData.js` used by both the delete route and account deletion.

**Client:** screens `BlogsView`, `PostView`, `AuthorView`, `StudioView` (its own full-screen layout, lazy-loaded with its editor), reusing `CommentsSection`, `useBookmarks`'s pattern and the upload endpoint. The router gets a small table of real-path pages with reserved prefixes (`blog`, `authors`, `write`), so they are never mistaken for curriculum modules.

**Server rendering:** one Pages Function per prefix fetches the app shell and rewrites the head (title, description, canonical, Open Graph, JSON-LD) and the article HTML, the same way `scripts/build/prerender.mjs` does for modules. A `sitemap-blogs.xml` lists approved published posts; share cards reuse the card generator.

**Design system:** `styles/tokens.css` (the existing tokens, moved, plus type, spacing, z-index, focus and motion scales; a test keeps the two dark blocks identical), `components/ui/` with `styles/ui.css` (Button, IconButton, Field, Chip, Avatar, Card, Dialog, Menu, Tabs, Toast, Skeleton, EmptyState), and a living style guide at `/#__design`.

## Phases

Each phase ends with the browser and unit tests green, screenshots reviewed in light, dark and mobile, and the existing features checked. Nothing is pushed until you say so.

### Phase 2: design system, navigation, homepage

- **2a Tokens.** Move the tokens to `tokens.css`, add the scales, add the dark-drift test. No visual change.
- **2b Components and style guide.** The primitives above, accessible by construction (focus trap, Esc, roving tabindex, live regions), plus `/#__design`. Replace the `confirm()` and `alert()` calls and the ad hoc toasts.
- **2c Shell.** Labelled compact rail with groups; a mobile bar of five plus "More"; the account menu rebuilt on Menu and Dialog; a global focus ring; a `<main>` landmark; no sign-in flash; sign-in returns to the same page and the redirect is validated; a short enter animation on screen changes.
- **2d Landing and dashboard.** The signed-in dashboard greets the reader and points to the community; spacing defects fixed.
- *Done when:* no new dependency; contrast of every text token at least 4.5:1 (`--fg-subtle` fixed); the e2e suite passes unchanged; new e2e tests cover dialog, menu, tabs and toasts; reduced motion verified.

### Phase 3: blogging platform and studio

- **3a Data, API, renderer. Done (committed locally, not pushed).** Migration `0002_blogs.sql`, `api/routes/blogs.js`, and `webapp/src/lib/blog/` (validate, render, plain text, reading time). Tests include hostile documents (script, event handlers, `javascript:` links, same-origin images, oversized and deeply nested input) and the ownership matrix (an author can edit only their own posts; an admin can hide): 19 library tests and 34 API tests, and the same routes were run once on the real Workers runtime against a local D1 (48 checks). **Before the code is pushed, apply the migration with `npm run db:migrate:remote`:** the deploy smoke test now calls `/api/blogs` and fails the run without it.
- **3b Reading. Done (committed locally, not pushed).** Explore Blogs (`/blog/`: search, topics, newest or most liked, paged, the filters kept in the address), the article page (cover, author line, reading time, a progress line, an outline, like, save, share, report, more to read, the discussion), the author page, and a saved list of articles in Saved. An article is drawn by the code and styles of a curriculum module (highlighted code with a copy button, diagrams, video cards, content blocks). The pages have real addresses, drawn by the server for crawlers and link previews (`api/pages/blogPages.js`, three small Pages Functions, `/sitemap-blogs.xml`, listed in `robots.txt`); the deploy smoke test checks them. Pictures for articles have an upload limit of their own. Not done: a share card drawn per article (an article uses its cover, otherwise the site's card); the command palette does not find articles yet (Phase 5).
- **3c Studio. Done (committed locally, not pushed).** `/write/` lists your articles and `/write/<id>` is the editor ([STUDIO.md](STUDIO.md)): a large title and subtitle, a Tiptap editor drawn with the article styles, the "/" menu (headings, lists, to-dos, quotes, code with a language, diagrams, callouts, tables, pictures, video, dividers), markdown shortcuts, a floating toolbar for selected text with a checked link box, a handle on each block (add below, turn into, duplicate, delete, drag), alt text and captions for pictures, pictures by upload, drop or paste, a YouTube video from a pasted address, a preview that is the page readers get, focus mode, a shortcuts dialog, and a publish dialog (cover, description, topics, now or scheduled, an author name asked for at the first publish). Saving is honest: saved, unsaved, saving, offline, error and conflict are different things, a copy is kept on the device and offered back, nothing is overwritten from a stale copy, and leaving flushes first. No new dependency: the "/" menu and the code colours are written here instead of `@tiptap/suggestion` and `lowlight`.
- **3d Assistant. Done (committed locally, not pushed).** Optional and hidden unless the site is set up for it (Cloudflare Workers AI with one binding line, or an Anthropic key). Improve or rewrite the selected text (five tones), suggest titles, a description and topics, summarize, an outline from the title, and a table of contents made locally from the headings. It only suggests: each answer is a card with what it would replace beside it, applied by a button, undone by Undo, and refused if the text changed meanwhile. A few calls a minute and a daily allowance per author; the answers are cleaned to plain text. **To switch it on, add `"ai": { "binding": "AI" }` to `wrangler.jsonc` (Workers AI) or set the secret `ANTHROPIC_API_KEY`; nothing has been added to `wrangler.jsonc`.**
- **3e Moderation. Done (committed locally, not pushed).** An Articles section in the admin dashboard: what is waiting for approval (with a count on the tab and on the overview), reported, taken down and everything live; approve, take down, put back, and trust or stop trusting an author. The Report button on an article was done in 3b.
- *Done when:* a signed-in reader can do all nine steps in the brief (sign in, open the studio, write, insert code, diagrams and images, preview, save a draft, publish, share, receive comments); the access test lists every new route; a direct load of `/blog/<slug>` returns the article in its HTML; the deploy smoke test calls a blog endpoint.

### Phase 4: community and profiles

- **Done earlier (3b, 3c):** handles and an author page with editing, Saved includes bookmarked articles, account deletion covers every table.
- **4a Community hub. Done (committed locally, not pushed).** One "Community" place in the rail instead of four (Feed, Community, Books, Suggestions). Its tabs are **Questions**, **Posts** (the feed), **Resources** (books) and **Ideas** (suggestions), each at the address it always had (`#__community`, `#__feed`, `#__books`, `#__suggestions`), so every old link opens the right tab; a post's own page (`#__feed@<id>`) is not a tab and goes back to Posts. The tab strip stays on the page while the tab changes (so the keyboard keeps its place and only the panel waits for a screen that is still loading), a tab with something new since the last visit says so, and so does the rail. "Unanswered" became a filter of Questions. The command palette finds each tab, also by its old name ("feed", "books"). The tabs are one table in `webapp/src/config/community.js`.
- **4b Comments and notifications. Done (committed locally, not pushed).** The three comment bugs the audit found, and a notification list that works. "Newest" really was oldest first: the discussion now has **Oldest**, **Newest** and **Most helpful** (an answer always leads; replies stay in the order they were written). Deleting a comment that has replies used to hide the replies for good while they stayed in the table: now it stays as a stand-in (no name, no words, nothing to do but reply), and goes when its last reply goes; a comment without replies is removed. Deleting an account does the same for its comments (replies and unanswered comments are deleted, the start of a thread others took part in stays without a name). A question in Community opens its module **scrolled to that comment**, marked and focused (`#comment-<id>`, held in view while the page settles), and the same anchor works from any link. The account menu lists the replies and mentions that are new, as "who replied" and where, and each leads there: the module and the comment, the article, or the post (before, a reply on a post showed the raw `feed:` path and led to a module that does not exist). The API gained `items` on `/comments/activity` (and `deleted` on a comment); `comments.test.js` is the first test file for the comments (11 tests, and one more for account deletion).
- **Still to do:** own-post edit and delete in Posts, Resources and Ideas; the counts endpoint and pagination for the feed.

### Phase 5: learning modules and workspace

The Workspace moves onto the studio's editor core; the 780-line override layer in `global.css` goes; module pages get the reading-route progress line and better code blocks; the command palette finds blogs and authors; the module tree is keyboard-operable.

### Phase 6: polish

A motion pass; a responsive sweep from 360 to 1920 px; an accessibility audit; performance budgets for the main bundle and the studio chunk.

## Risks

| Risk | Mitigation |
|---|---|
| Spam or abuse on a new domain | D5: noindex until trusted, report button, admin queue, `nofollow ugc` links, rate limits on every write |
| Stored XSS | D2 renderer allow-list, no raw HTML stored, hostile-document tests, CSP unchanged |
| A forgotten migration | Smoke test calls a blog endpoint; the docs say to run `npm run db:migrate:remote` before pushing |
| Privacy and terms | Public handle and name are opt-in; the two pages get a short update (drafted for your approval) |
| Assistant cost or misuse | Hidden unless configured; daily cap per user; never auto-applies; input size limits |
| D1 limits (row size about 2 MB; full-text search unverified) | 200 KB content cap; search starts as `LIKE` on title, excerpt and text |
| Regressions in existing screens | Existing selectors preserved; e2e runs after every phase; screens move onto the new components one at a time |
| Size of the studio | Lazy-loaded chunk; new Tiptap packages only (`suggestion`, `code-block-lowlight` with `lowlight`) |

## Open questions (defaults are used until you say otherwise)

1. **Assistant provider:** Workers AI by default (needs the one binding line in `wrangler.jsonc`), Anthropic optional. Which do you want?
2. **Moderation:** noindex until trusted (default), approval before anything is visible, or fully open?
3. **Feed:** keep it as Posts inside Community (default) or retire it in favour of blogs?
4. **Public identity and legal pages:** handle, name and optional avatar, with a short privacy and terms update for you to approve (default).
5. **Reading typeface:** system serif now (default) or a self-hosted web font later?

## Not in this plan

Following authors, newsletters and email notifications, monetisation, collaborative editing, comments on selected text, and a native app. Each can be added on top without changing the design above.
