-- 0003: the Practice Center and the Design Lab: quiz attempts, exercise and design submissions with their reviews, announcements,
-- and an audit log of what admins did (docs/revamp/DATA_MODEL_INVENTORY.md).
--
-- Tables and indexes only, each IF NOT EXISTS (api/tests/migrations.test.js runs every migration twice). The quizzes, exercises and
-- challenges themselves are not here: they are content in git (content/practice, content/design-lab) and are served from
-- api/generated/practice-content.json. Apply this to the live database before the code that uses it is deployed:
--   npm run db:migrate:remote

-- One try at a quiz. A visitor who is not signed in can take a quiz but nothing is kept.
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  quiz_id    TEXT NOT NULL,      -- the quiz's slug
  score      INTEGER NOT NULL,   -- questions answered correctly
  max_score  INTEGER NOT NULL,   -- questions in the quiz when it was taken
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(quiz_id);

CREATE TABLE IF NOT EXISTS quiz_answers (
  attempt_id  TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer      TEXT NOT NULL,     -- the chosen option ids, as a JSON array
  correct     INTEGER NOT NULL,
  PRIMARY KEY (attempt_id, question_id)
);

-- A person's work on an exercise or a design challenge: private until they submit and choose to share it.
CREATE TABLE IF NOT EXISTS submissions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  kind         TEXT NOT NULL,                  -- 'exercise', 'lld' or 'hld'
  challenge_id TEXT NOT NULL,                  -- the exercise's slug, or the challenge's slug
  text         TEXT NOT NULL DEFAULT '',       -- the written answer (Markdown as plain text)
  diagram      TEXT NOT NULL DEFAULT '',       -- Mermaid source
  diagram_url  TEXT,                           -- or an uploaded diagram, from the site's own upload storage
  code         TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'draft',  -- 'draft', 'submitted' or 'reviewed'
  shared       INTEGER NOT NULL DEFAULT 0,     -- 1: others may read it (only once it is submitted)
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  submitted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_one ON submissions(user_id, kind, challenge_id);
CREATE INDEX IF NOT EXISTS idx_submissions_challenge ON submissions(kind, challenge_id, status);

CREATE TABLE IF NOT EXISTS submission_reviews (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  reviewer_id   TEXT NOT NULL,
  text          TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_submission_reviews_submission ON submission_reviews(submission_id);

-- A notice the owner puts at the top of every page for a while.
CREATE TABLE IF NOT EXISTS announcements (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  starts_at  TEXT NOT NULL,
  ends_at    TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- What admins did, newest last: who, what, to what.
CREATE TABLE IF NOT EXISTS audit_log (
  id     TEXT PRIMARY KEY,
  actor  TEXT NOT NULL,        -- the admin's e-mail address
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_log_at ON audit_log(at);
