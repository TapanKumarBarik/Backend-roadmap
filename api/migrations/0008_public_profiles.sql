-- 0008: Opt-in public profiles.
-- A signed-in reader can choose to publish a small page about their progress: a handle, a name, and a snapshot of what the game says they have done
-- (level, XP, streak, problems solved, badges). It is what the reader sends, kept as they sent it (the game is computed in their browser from their own
-- progress), shown as "self-reported", and gone when they remove it or delete their account. Nothing is public unless a row is here.
--
-- Tables and indexes only, each IF NOT EXISTS (api/tests/migrations.test.js runs every migration twice).

CREATE TABLE IF NOT EXISTS public_profiles (
  user_id      TEXT PRIMARY KEY,
  handle       TEXT NOT NULL UNIQUE,   -- lower-case letters, digits and hyphens: the address of the profile
  display_name TEXT NOT NULL,          -- what the reader chose to be called there
  snapshot     TEXT NOT NULL,          -- JSON: the counts and badge ids api/routes/profile.js accepts, and nothing else
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
