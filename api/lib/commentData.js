// What deleting an account does to the comments it wrote, as a list of [sql, ...params] for `batch()` (study.js). Its replies,
// and its comments nobody replied to, are deleted; a comment others replied to stays without a name or a text, so the thread
// keeps its start. A stand-in that has lost its last reply goes too. (routes/comments.js does the same for one comment that
// somebody deletes.) Each list runs in order inside one transaction.

import { DELETED } from './deleted.js';

const NO_REPLY = 'NOT EXISTS (SELECT 1 FROM comments r WHERE r.path = c.path AND r.parent_id = c.id)';
const VOTES_ON = (condition) => `DELETE FROM comment_votes WHERE EXISTS (SELECT 1 FROM comments c WHERE c.path = comment_votes.path AND c.id = comment_votes.comment_id AND ${condition})`;

export function commentsOfAccount(userId) {
  const mine = 'c.user_id = ?1';
  return [
    // her replies: nothing hangs off a reply
    [VOTES_ON(`${mine} AND c.parent_id != ''`), userId],
    ["DELETE FROM comments WHERE user_id = ?1 AND parent_id != ''", userId],
    // her comments nobody replied to
    [VOTES_ON(`${mine} AND ${NO_REPLY}`), userId],
    [`DELETE FROM comments WHERE id IN (SELECT c.id FROM comments c WHERE ${mine} AND ${NO_REPLY})`, userId],
    // stand-ins that had only her replies under them
    [`DELETE FROM comments WHERE id IN (SELECT c.id FROM comments c WHERE ${mine} AND ${NO_REPLY})`, DELETED.userId],
    // what is left of hers has replies from others: it stays, without her name and her words
    [VOTES_ON(mine), userId],
    ['UPDATE comments SET display_name = ?2, text = ?3, user_id = ?4, is_answer = 0, mentions = ?5 WHERE user_id = ?1', userId, DELETED.name, DELETED.text, DELETED.userId, DELETED.mentions]
  ];
}
