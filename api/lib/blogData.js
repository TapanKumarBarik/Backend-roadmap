// The writes that take blog data away, as lists of [sql, ...params] for `batch()`: one post (the author deleting it, or
// an admin) and everything an account holds (study.js, delete-my-data). One place, so a table added to the blogs is
// added to both. Each list runs in order inside one transaction, which is why a count is corrected before the rows
// that justify it are deleted. And the one rule that says which posts a reader may see.

import { BLOG_PREFIX, blogPath } from './commentPaths.js';

/** A post a reader may see: published, its time has come, and not taken down. Written on a table aliased `p`, with the time as ?1. */
export const VISIBLE = "p.status = 'published' AND p.publish_at IS NOT NULL AND p.publish_at <= ?1 AND p.hidden = 0";

/** A post, with its tags, likes, bookmarks, reports and the discussion under it. */
export function postRemoval(postId) {
  return [
    ['DELETE FROM blog_tags WHERE post_id = ?1', postId],
    ['DELETE FROM blog_likes WHERE post_id = ?1', postId],
    ['DELETE FROM blog_bookmarks WHERE post_id = ?1', postId],
    ['DELETE FROM blog_reports WHERE post_id = ?1', postId],
    ['DELETE FROM post_classification WHERE post_id = ?1', postId],
    ['DELETE FROM post_versions WHERE post_id = ?1', postId],
    ['DELETE FROM post_moderation WHERE post_id = ?1', postId],
    ['DELETE FROM comment_votes WHERE path = ?1', blogPath(postId)],
    ['DELETE FROM comments WHERE path = ?1', blogPath(postId)],
    ['DELETE FROM blog_posts WHERE id = ?1', postId]
  ];
}

/**
 * Everything one account has in the blogs: its posts (and what hangs off them), its author profile, the likes and
 * bookmarks it gave. Its reports stay as moderation evidence but no longer say who sent them.
 */
export function authorRemoval(userId) {
  const mine = 'SELECT id FROM blog_posts WHERE author_id = ?1';
  const onMine = `SELECT '${BLOG_PREFIX}' || id FROM blog_posts WHERE author_id = ?1`;
  return [
    ['UPDATE blog_posts SET likes = MAX(likes - 1, 0) WHERE id IN (SELECT post_id FROM blog_likes WHERE user_id = ?1)', userId],
    [`DELETE FROM blog_tags WHERE post_id IN (${mine})`, userId],
    [`DELETE FROM blog_likes WHERE post_id IN (${mine})`, userId],
    [`DELETE FROM blog_bookmarks WHERE post_id IN (${mine})`, userId],
    [`DELETE FROM blog_reports WHERE post_id IN (${mine})`, userId],
    [`DELETE FROM post_classification WHERE post_id IN (${mine})`, userId],
    [`DELETE FROM post_versions WHERE post_id IN (${mine})`, userId],
    [`DELETE FROM post_moderation WHERE post_id IN (${mine})`, userId],
    [`DELETE FROM comment_votes WHERE path IN (${onMine})`, userId],
    [`DELETE FROM comments WHERE path IN (${onMine})`, userId],
    ['DELETE FROM blog_posts WHERE author_id = ?1', userId],
    ['DELETE FROM author_profiles WHERE user_id = ?1', userId],
    ['DELETE FROM blog_likes WHERE user_id = ?1', userId],
    ['DELETE FROM blog_bookmarks WHERE user_id = ?1', userId],
    ['UPDATE blog_reports SET user_id = NULL WHERE user_id = ?1', userId]
  ];
}
