// What deleting an account removes from the Practice Center and the Design Lab: its quiz attempts and answers, its submissions and the
// reviews written about them (an admin's and other learners'), the feedback it gave on other people's solutions, as a list of [sql, ...params] for `batch()` (study.js). The reviews an admin wrote on other people's work
// stay with that work.

export function practiceRemoval(userId) {
  return [
    ['DELETE FROM quiz_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE user_id = ?1)', userId],
    ['DELETE FROM quiz_attempts WHERE user_id = ?1', userId],
    ['DELETE FROM submission_reviews WHERE submission_id IN (SELECT id FROM submissions WHERE user_id = ?1)', userId],
    ['DELETE FROM peer_reviews WHERE submission_id IN (SELECT id FROM submissions WHERE user_id = ?1)', userId],
    ['DELETE FROM peer_reviews WHERE reviewer_id = ?1', userId],
    ['DELETE FROM submissions WHERE user_id = ?1', userId]
  ];
}
