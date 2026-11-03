-- The private workspace as a personal hub: a page can be a folder, a study plan, a revision list or a saved diagram, not only a text
-- page. workspace_pages (0001) is not altered: what a page IS lives beside it. A page with no row here is a plain text page, so every page
-- made before this migration reads correctly without being touched.
--
-- All of it is private to one account and goes with it when the account is deleted (api/lib/workspaceData.js).
CREATE TABLE IF NOT EXISTS workspace_meta (
  page_id    TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,           -- 'folder' | 'plan' | 'revision' | 'diagram' (a plain page has no row)
  data       TEXT NOT NULL DEFAULT '{}', -- JSON the kind keeps: a plan's steps and target date, a diagram's source
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspace_meta_user ON workspace_meta(user_id);

-- The lessons on a revision list. "Last revised" and how many times decide when a lesson is due again (lib/workspace/revision.js).
CREATE TABLE IF NOT EXISTS revision_items (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  page_id         TEXT NOT NULL,      -- the revision list (a workspace_pages row)
  path            TEXT NOT NULL,      -- the lesson, as module_progress names it
  title           TEXT NOT NULL,
  added_at        TEXT NOT NULL,
  last_revised_at TEXT,
  revised_count   INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_revision_items_lesson ON revision_items(page_id, path);
CREATE INDEX IF NOT EXISTS idx_revision_items_user ON revision_items(user_id);
