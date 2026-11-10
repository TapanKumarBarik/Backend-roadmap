-- 0007: Daily architectural incident challenges and streak protection shields.
-- Powers the PagerDuty-style daily production outage challenge and streak retention loop.
--
-- Tables and indexes only, each IF NOT EXISTS (api/tests/migrations.test.js runs every migration twice).

-- Real-world architectural outages and production incidents.
CREATE TABLE IF NOT EXISTS daily_incidents (
  id                   TEXT PRIMARY KEY,
  date                 TEXT NOT NULL UNIQUE, -- YYYY-MM-DD
  title                TEXT NOT NULL,
  severity             TEXT NOT NULL DEFAULT 'P1', -- 'P1', 'P2', 'P3'
  service_name         TEXT NOT NULL,
  scenario_markdown    TEXT NOT NULL,
  logs_snippet         TEXT,
  options_json         TEXT NOT NULL, -- JSON array of [{ id, text }]
  correct_option       INTEGER NOT NULL,
  post_mortem_markdown TEXT NOT NULL,
  related_module       TEXT,
  created_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_daily_incidents_date ON daily_incidents(date);

-- Daily incident submissions by user.
CREATE TABLE IF NOT EXISTS incident_completions (
  user_id         TEXT NOT NULL,
  incident_id     TEXT NOT NULL,
  selected_option INTEGER NOT NULL,
  is_correct      INTEGER NOT NULL,
  completed_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, incident_id)
);
CREATE INDEX IF NOT EXISTS idx_incident_completions_user ON incident_completions(user_id, completed_at);

-- Streak shields: protects an active learning streak when a user misses one day.
CREATE TABLE IF NOT EXISTS streak_shields (
  user_id           TEXT PRIMARY KEY,
  shields_remaining INTEGER NOT NULL DEFAULT 1,
  last_replenished  TEXT NOT NULL
);

