-- The community's articles grow into several kinds of contribution, with a moderator's decision and a history. New tables beside
-- blog_posts rather than new columns on it (a migration cannot alter an existing table: api/tests/migrations.test.js runs each one twice).

-- What kind of contribution a post is, and where it belongs. A post with no row here is an 'article' in 'general'.
CREATE TABLE IF NOT EXISTS post_classification (
  post_id  TEXT PRIMARY KEY,
  kind     TEXT NOT NULL DEFAULT 'article',
  category TEXT NOT NULL DEFAULT 'general'
);
CREATE INDEX IF NOT EXISTS idx_post_classification_kind ON post_classification(kind, category);

-- Earlier states of a post, kept when its text changes (at most one every few minutes, and the newest few dozen), so an author can go back.
CREATE TABLE IF NOT EXISTS post_versions (
  id       TEXT PRIMARY KEY,
  post_id  TEXT NOT NULL,
  title    TEXT NOT NULL,
  content  TEXT NOT NULL,
  words    INTEGER NOT NULL DEFAULT 0,
  saved_at TEXT NOT NULL,
  reason   TEXT NOT NULL DEFAULT 'edit'     -- 'edit', 'publish' or 'restore'
);
CREATE INDEX IF NOT EXISTS idx_post_versions_post ON post_versions(post_id, saved_at);

-- Why a moderator took a post down, shown to its author.
CREATE TABLE IF NOT EXISTS post_moderation (
  post_id    TEXT PRIMARY KEY,
  note       TEXT NOT NULL DEFAULT '',
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL
);
