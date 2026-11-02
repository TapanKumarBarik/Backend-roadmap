-- 0002: community blogs: author profiles, posts, tags, likes, bookmarks and reports (docs/MODERNIZATION.md).
--
-- Tables and indexes only, each IF NOT EXISTS: api/tests/migrations.test.js runs every migration twice and expects the
-- second run to change nothing, so a migration cannot ALTER an existing table. Apply it to the live database before the
-- code that uses it is deployed:  npm run db:migrate:remote
--
-- A post's comments are not here: they are rows of `comments` whose path is 'blog:<post id>', the way the feed's are
-- 'feed:<post id>'.

-- A person's public identity as an author. It exists only once they choose a handle: a Google account's `sub` and
-- e-mail address are never shown, so /authors/<handle> needs a name of its own.
CREATE TABLE IF NOT EXISTS author_profiles (
  user_id    TEXT PRIMARY KEY,
  handle     TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  bio        TEXT,
  website    TEXT,
  avatar_url TEXT,               -- only when the author chose to show their picture
  trusted    INTEGER NOT NULL DEFAULT 0,   -- 1: their posts are approved for search engines as they are published
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id         TEXT PRIMARY KEY,   -- time-sortable, like every other id
  author_id  TEXT NOT NULL,      -- users.user_id
  slug       TEXT UNIQUE,        -- the address /blog/<slug>; chosen at the first publish, then kept; NULL while only a draft
  title      TEXT NOT NULL DEFAULT '',
  subtitle   TEXT,
  excerpt    TEXT,
  cover_url  TEXT,
  content    TEXT NOT NULL,      -- the document: ProseMirror JSON, rebuilt from an allow-list on every save
  body_text  TEXT,               -- its plain text, for search
  words      INTEGER NOT NULL DEFAULT 0,
  minutes    INTEGER NOT NULL DEFAULT 1,
  status     TEXT NOT NULL DEFAULT 'draft',  -- 'draft' or 'published'
  publish_at TEXT,               -- when it is, or becomes, visible. In the future it is "scheduled": no timer, readers' queries compare it with now
  approved   INTEGER NOT NULL DEFAULT 0,     -- 1: indexed by search engines and in the sitemap (a trusted author's posts are approved on publish)
  hidden     INTEGER NOT NULL DEFAULT 0,     -- 1: taken down by a moderator
  likes      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_author ON blog_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_listing ON blog_posts(status, publish_at);

CREATE TABLE IF NOT EXISTS blog_tags (
  post_id TEXT NOT NULL,
  tag     TEXT NOT NULL,
  PRIMARY KEY (post_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_blog_tags_tag ON blog_tags(tag);

CREATE TABLE IF NOT EXISTS blog_likes (
  post_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS blog_bookmarks (
  user_id    TEXT NOT NULL,
  post_id    TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_blog_bookmarks_post ON blog_bookmarks(post_id);

CREATE TABLE IF NOT EXISTS blog_reports (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL,
  user_id    TEXT,
  reason     TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_blog_reports_post ON blog_reports(post_id);
