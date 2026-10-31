-- 0001: the schema the site launched with. Every later change to the database is a new numbered file beside this
-- one, never an edit to a file that has already been applied (see api/README.md, "Changing the database").
--
-- Every statement is IF NOT EXISTS because the production database already holds this schema (it was set up
-- before migrations existed): applying it there changes nothing and only records "0001 applied", while on a new
-- database (local development, a contributor's own Cloudflare account, the tests) it builds everything.
--
-- History: this schema replaced Azure Table Storage's 17 tables. Table Storage's partition-key/row-key pairs became
-- real composite primary keys here; in a few places (feed_votes, suggestion_votes, comment_votes) the old row key
-- was a manually concatenated "<id>_<voterId>" string the app had to split at read time, and those became real
-- columns with a real PRIMARY KEY, which is strictly better, not just a mechanical translation.
--
-- Column names are snake_case (SQL convention); the API layer maps them back to the camelCase JSON shape the
-- frontend expects.

CREATE TABLE IF NOT EXISTS admins (
  email      TEXT PRIMARY KEY,
  granted_by TEXT,
  granted_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  user_id    TEXT PRIMARY KEY,   -- Google `sub` claim
  email      TEXT,
  name       TEXT,
  picture    TEXT,
  first_seen TEXT,
  last_seen  TEXT
);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id    TEXT NOT NULL,
  path       TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (user_id, path)
);

CREATE TABLE IF NOT EXISTS books (
  id             TEXT PRIMARY KEY,  -- was rowKey: <ms-timestamp>-<hex>, kept as TEXT so string sort order == chronological order
  user_id        TEXT,
  display_name   TEXT,
  title          TEXT NOT NULL,
  tag            TEXT,
  link_url       TEXT,
  attachment_url TEXT,
  created_at     TEXT
);

CREATE TABLE IF NOT EXISTS feed_posts (
  id              TEXT PRIMARY KEY,
  user_id         TEXT,
  display_name    TEXT,
  text            TEXT,
  attachment_url  TEXT,
  attachment_type TEXT,
  link_title      TEXT,
  created_at      TEXT
);

CREATE TABLE IF NOT EXISTS feed_votes (
  post_id    TEXT NOT NULL,
  voter_id   TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (post_id, voter_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  user_id      TEXT,
  display_name TEXT,
  email        TEXT,
  text         TEXT,
  created_at   TEXT
);

CREATE TABLE IF NOT EXISTS module_progress (
  user_id    TEXT NOT NULL,
  path       TEXT NOT NULL,
  status     TEXT,
  updated_at TEXT,
  PRIMARY KEY (user_id, path)
);

CREATE TABLE IF NOT EXISTS notes (
  user_id    TEXT NOT NULL,
  path       TEXT NOT NULL,
  text       TEXT,
  updated_at TEXT,
  PRIMARY KEY (user_id, path)
);

CREATE TABLE IF NOT EXISTS page_views (
  id        TEXT PRIMARY KEY,
  date      TEXT,   -- YYYY-MM-DD, was the Table Storage partition key
  path      TEXT,
  user      TEXT,
  referrer  TEXT,
  timestamp TEXT
);
CREATE INDEX IF NOT EXISTS idx_page_views_date ON page_views(date);

CREATE TABLE IF NOT EXISTS rate_limits (
  user_id      TEXT NOT NULL,
  bucket       TEXT NOT NULL,  -- 'feed' | 'books' | 'messages' | 'suggestions' | 'comments'
  window_start TEXT,
  count        INTEGER,
  PRIMARY KEY (user_id, bucket)
);

CREATE TABLE IF NOT EXISTS reactions (
  path       TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  emoji      TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (path, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS streaks (
  user_id           TEXT PRIMARY KEY,
  current_streak    INTEGER,
  longest_streak    INTEGER,
  last_active_date  TEXT
);

CREATE TABLE IF NOT EXISTS suggestions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT,
  display_name TEXT,
  text         TEXT,
  created_at   TEXT
);

CREATE TABLE IF NOT EXISTS suggestion_votes (
  suggestion_id TEXT NOT NULL,
  voter_id      TEXT NOT NULL,
  created_at    TEXT,
  PRIMARY KEY (suggestion_id, voter_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id           TEXT PRIMARY KEY,
  path         TEXT NOT NULL,   -- module path, or 'feed:<postId>' for feed-post comments
  user_id      TEXT,
  display_name TEXT,
  text         TEXT,
  parent_id    TEXT,
  is_answer    INTEGER DEFAULT 0,
  hidden       INTEGER DEFAULT 0,
  edited_at    TEXT,
  created_at   TEXT,
  mentions     TEXT  -- JSON array, stored as text, same as today
);
CREATE INDEX IF NOT EXISTS idx_comments_path ON comments(path);

CREATE TABLE IF NOT EXISTS comment_votes (
  path      TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  voter_id  TEXT NOT NULL,
  PRIMARY KEY (path, comment_id, voter_id)
);

CREATE TABLE IF NOT EXISTS workspace_pages (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  title      TEXT,
  parent_id  TEXT,
  sort_order INTEGER,
  content    TEXT,  -- JSON (Tiptap doc), stored as text, same as today
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_workspace_pages_user ON workspace_pages(user_id);
