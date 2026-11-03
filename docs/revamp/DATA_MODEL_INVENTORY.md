# Data model inventory

D1 (SQLite), migrations `api/migrations/0001_initial.sql` and `0002_blogs.sql`, applied by hand with `npm run db:migrate:remote`.
A migration can only add tables or indexes (`IF NOT EXISTS`); `migrations.test.js` runs every migration twice. All 24 tables are kept.
Privacy column: **P** private to the user, **U** public with the author's name, **A** aggregate or admin only.

| Table | Holds | Key columns | Privacy | Deleted with the account |
|---|---|---|---|---|
| `users` | the directory: one row per signed-in person | `user_id` (Google sub), `email`, `name`, `picture`, `first_seen`, `last_seen` | P | deleted |
| `admins` | who may use `/api/manage/*` (the owner e-mail is implicit) | `email`, `granted_by`, `granted_at` | A | n/a |
| `module_progress` | status of a lesson per user | `user_id`, `path`, `status`, `updated_at` | P | deleted |
| `notes` | a private note per lesson | `user_id`, `path`, `text` | P | deleted |
| `bookmarks` | saved lessons | `user_id`, `path` | P | deleted |
| `streaks` | day streak | `user_id`, `current_streak`, `longest_streak`, `last_active_date` | P | deleted |
| `reactions` | emoji on a lesson | `path`, `user_id`, `emoji` | counts public | deleted |
| `comments` | discussion under a lesson (`path` = lesson), a feed post (`feed:<id>`) or an article (`blog:<id>`) | `id`, `path`, `user_id`, `display_name`, `text`, `parent_id`, `is_answer`, `hidden`, `mentions` | U | replies and unanswered comments deleted; others stay as a stand-in |
| `comment_votes` | helpful votes | `path`, `comment_id`, `voter_id` | counts public | deleted |
| `feed_posts`, `feed_votes` | community posts and their votes | `id`, `user_id`, `display_name`, `text`, `attachment_url`, `link_title` | U | name removed, text stays |
| `books` | recommended resources | `title`, `tag`, `link_url`, `attachment_url` | U | name removed |
| `suggestions`, `suggestion_votes` | ideas and their votes | `text` | U | name removed |
| `messages` | notes to the owner | `user_id`, `email`, `text` | A | anonymized |
| `workspace_pages` | the private page tree | `id`, `user_id`, `title`, `parent_id`, `sort_order`, `content` (Tiptap JSON) | P | deleted |
| `page_views` | visitor counts, tagged anonymous or by e-mail | `date`, `path`, `user`, `referrer` | A | tag anonymized |
| `rate_limits` | write limits | `user_id`, `bucket`, `window_start`, `count` | A | deleted |
| `author_profiles` | public author identity | `user_id`, unique `handle`, `name`, `bio`, `website`, `avatar_url`, `trusted` | U | deleted |
| `blog_posts` | articles (ProseMirror JSON rebuilt from an allow-list) | `author_id`, unique `slug`, `title`, `content`, `status`, `publish_at`, `approved`, `hidden`, `likes` | draft P, published U | deleted |
| `blog_tags`, `blog_likes`, `blog_bookmarks`, `blog_reports` | topics, likes, saves, reports | per post | likes and saves P; reports A | deleted (reports stay, unsigned) |

Content that is **not** in the database: lessons, learning paths (`content/paths.json`), the video registry (`content/videos.json`).
They are reviewed in git and built into the site.

## Proposed additions for 2.0 (additive only; nothing existing is altered)

Rule: **definitions live in git, attempts and submissions live in D1.** Quiz and challenge definitions are content (reviewed in pull
requests, prerendered, searchable, free to roll back); what a person did with them is data.

| New table | For | Notes |
|---|---|---|
| `quiz_attempts` | a person's try at a quiz | `id`, `user_id`, `quiz_id` (a slug from `content/`), `score`, `max_score`, `started_at`, `finished_at`; P |
| `quiz_answers` | one answer in an attempt | `attempt_id`, `question_id`, `answer` (JSON), `correct`; P |
| `submissions` | an exercise or design challenge submission | `id`, `user_id`, `kind` (`exercise`, `lld`, `hld`), `challenge_id` (slug), `body` (document JSON), `diagram` (Mermaid source or upload URL), `code`, `status` (`draft`, `submitted`, `reviewed`, `published`), timestamps; P until published |
| `submission_reviews` | feedback on a submission | `submission_id`, `reviewer_id`, `text`, `created_at` |
| `content_reviews` | a general review state for community content types | `kind`, `ref_id`, `state` (`draft`, `pending`, `approved`, `rejected`, `published`), `reviewer_id`, `note` |
| `announcements` | admin notices | `id`, `title`, `body`, `starts_at`, `ends_at` |
| `audit_log` | admin and moderation actions | `id`, `actor`, `action`, `target`, `at` |

Comments under a challenge reuse `comments` with a new path prefix (`challenge:<slug>`), as feed and blog already do
(`api/lib/commentPaths.js`). Each new table is added to the account-deletion lists in the same commit as its migration.
