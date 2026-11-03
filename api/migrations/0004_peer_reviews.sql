-- Feedback from other learners on a design or exercise solution that its author chose to share. Separate from submission_reviews, which is
-- what an admin writes. The reviewer's name is kept as it was when the review was written (like a comment's), and goes with the account
-- when it is deleted (api/lib/practiceData.js).
CREATE TABLE IF NOT EXISTS peer_reviews (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  reviewer_id   TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  text          TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_peer_reviews_submission ON peer_reviews(submission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_peer_reviews_reviewer ON peer_reviews(reviewer_id);
