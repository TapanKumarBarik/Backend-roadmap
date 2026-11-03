# Existing features inventory

Classification for the 2.0 revamp: **PRESERVE** (works, leave it), **IMPROVE** (keep and extend), **REPLACE** (rebuild, behaviour kept),
**DEPRECATE** (retire later, with a migration). Nothing here is deleted by this document. "Done" refers to docs/MODERNIZATION.md.

| Feature | Where | State | Class | Notes for 2.0 |
|---|---|---|---|---|
| Curricula: backend, learn, genai, lld, system-design | `content/`, `scripts/build/prerender.mjs` | 817 prerendered pages, 164 unwritten placeholders (noindex) | PRESERVE | Addresses are registered. Placeholders stay noindex until written. |
| Learning paths (8) | `content/paths.json`, `lib/curriculum/learningPaths.js`, dashboard `PathPicker`, `Sidebar` | live | IMPROVE | Add a path page, difficulty, prerequisites, skills (new fields in `paths.json`, not the database). |
| Lesson page | `components/article/ArticleView.jsx` | tree, article, outline, pager, notes, bookmark, reactions, comments, resume chip, reading line | IMPROVE | Related quizzes and challenges; reading preferences; collapsible panels already exist. |
| Module tree / sidebar | `layout/Sidebar.jsx` | live, collapsible, filters (All/To do/Doing/Done/Path) | IMPROVE | Keyboard operability of the tree is still open. |
| Progress tracking | `module_progress`, `useProgressStore`, local IndexedDB when signed out | live | PRESERVE | Source of truth for My Learning. |
| Bookmarks, personal notes | `bookmarks`, `notes`, `NotesPanel`, Saved screen | live | PRESERVE | |
| Private workspace | `workspace_pages`, `components/workspace` (Tiptap) | live | PRESERVE | Not moved onto the studio core (schema differs: h1 allowed); improve folders, study plans and drafts in place. |
| Videos | `content/videos.json`, `VideosView`, lecture embeds, `videos:sync` | 60 videos, chapters, module mapping | PRESERVE / IMPROVE | Timestamps beyond chapters need real data from YouTube descriptions; never invent. |
| Search | `CommandPalette`, `search-index.json`, `/api/blogs?q=` | modules (full text), tags, articles, authors (`@`) | IMPROVE | Add quizzes, challenges, community content as they are built. |
| Design system | `styles/tokens.css`, `ui.css`, `components/ui`, `/#__design` | Done | PRESERVE | Becomes `DESIGN_SYSTEM.md`; light/dark, OS preference, persisted. |
| Navigation shell | `DestinationRail`, `TopBar`, phone bottom bar + More | Done | IMPROVE | Relabel to the six destinations; addresses unchanged. |
| Landing page and dashboard | `home/Landing.jsx`, `home/EmptyState.jsx`, `CommunityStrip` | Done | IMPROVE | More sections (domains, popular lessons, challenges, quizzes). |
| Community: questions, posts, resources, ideas | `CommunityHub` + 4 tabs, `comments`, `feed_posts`, `books`, `suggestions` | Done (tabs, counts, deep links) | IMPROVE | Add content types and review states. |
| Discussions on every lesson | `CommentsSection`, `comments` | Done (sort, stand-ins, deep links) | PRESERVE | |
| Reactions (emoji) | `reactions`, `ReactionsBar` | live | PRESERVE | |
| Community blogs | `blog_*`, `/blog`, `/authors`, server-drawn pages | Done | PRESERVE | Becomes one content type of the wider community model. |
| Writing studio | `components/studio`, `docs/STUDIO.md` | Done | PRESERVE / reuse | The authoring base for lessons, submissions and community posts. |
| AI writing assistant | `api/lib/assistant`, `AssistantPanel` | Done, hidden until configured | PRESERVE | |
| Moderation | admin Articles, comment delete/answer, hide/trust | partial | IMPROVE | A general review queue for all user content. |
| Admin dashboard | `components/admin` (7 sections) | live | IMPROVE | Add quiz bank, challenges, submission review, announcements, audit log, SEO. |
| Content editor for admins | `/api/manage/content`, `ContentEditor` (commits to GitHub) | live | PRESERVE | Rich editing and version history can ride on git history. |
| Analytics | `page_views`, `/api/manage/pageviews`, usage | live (real data) | PRESERVE | No fake dashboards. |
| Messages to the owner | `messages`, `MessageOwnerModal` | live | PRESERVE | |
| Authentication | Google OAuth, signed cookie | live | PRESERVE | |
| Account deletion | `DELETE /api/account` | covers every table | PRESERVE | Must be extended with every new table. |
| Streak | `streaks` | live | PRESERVE | |
| Theme | `useTheme` (auto/light/dark, persisted) | live | PRESERVE | |
| SEO | prerendered head, canonical, JSON-LD, sitemap, share cards, IndexNow | live | PRESERVE | URL registry gate added. |
| Performance budgets, accessibility audit, URL registry | `check:bundle`, `audit.e2e.mjs`, `check:urls` | Done | PRESERVE | Gates for every 2.0 phase. |
| Quizzes, exercises, interview prep | none | not built | NEW | Phase 5. |
| Design Lab | none (lessons in `content/lld`, `content/system-design`) | not built | NEW | Phase 6. |
| My Learning page | pieces exist on separate screens | not built | NEW | Phase 8, built from existing data. |
| Announcements, audit log, SEO management | none | not built | NEW | Phase 9. |

Nothing is classed REPLACE or DEPRECATE: no existing feature is a candidate for removal. The only retirement considered is cosmetic
(rail labels such as "Feed" are already folded into Community tabs with their addresses intact).
