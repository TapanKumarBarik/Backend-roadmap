-- 0009: A reader's own state, kept for them so it follows them from one device to another.
-- The Prep Tracker (webapp/tracker/, drawn by webapp/src/tools/tracker.js) keeps a reader's progress in their browser. A reader who is signed in and
-- chooses to can also keep a copy here, and every browser they turn it on in reads and writes the same one. One row for each (reader, name): `name` is what the
-- state is (api/routes/state.js lists the names it accepts and how large each may be), `data` is the JSON the browser sends, kept as it was sent, and
-- `updated_at` is what a browser quotes when it writes so that two devices cannot overwrite each other without noticing. Private to the reader, gone when
-- they stop syncing or delete their account.
--
-- Tables and indexes only, each IF NOT EXISTS (api/tests/migrations.test.js runs every migration twice).

CREATE TABLE IF NOT EXISTS user_state (
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, name)
);
