// A comment hangs off a `path`: the address of a curriculum module, or, for what people write here, a prefix and the
// post's id ('feed:<id>' for a feed post, 'blog:<id>' for an article). Every place that tells the two apart uses this.

import { CHALLENGE_PATH_PREFIX, COMMENT_PATH_PREFIX, FEED_PATH_PREFIX, PROBLEM_PATH_PREFIX } from '../../webapp/src/lib/blog/limits.js';

// Shared with the app, which builds the same paths to show a post's or an article's discussion.
export const FEED_PREFIX = FEED_PATH_PREFIX;
export const BLOG_PREFIX = COMMENT_PATH_PREFIX;
export const CHALLENGE_PREFIX = CHALLENGE_PATH_PREFIX;
export const PROBLEM_PREFIX = PROBLEM_PATH_PREFIX; // 'code:<slug>': what is said under a coding problem

export const feedPath = (postId) => FEED_PREFIX + postId;
export const blogPath = (postId) => BLOG_PREFIX + postId;

/** A WHERE condition on `path` that is true for a comment on a curriculum module and false for one on a post. */
export const ON_A_MODULE = [FEED_PREFIX, BLOG_PREFIX, CHALLENGE_PREFIX, PROBLEM_PREFIX].map((prefix) => `path NOT LIKE '${prefix}%'`).join(' AND ');
