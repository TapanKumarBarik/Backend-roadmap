// What the app knows about the places a comment can be: the anchor a link to one carries, and where an item of activity (a reply
// or a mention, from /api/comments/activity) leads.

import { CHALLENGE_PATH_PREFIX, COMMENT_PATH_PREFIX, FEED_PATH_PREFIX } from './blog/limits.js';

// A comment can be linked to: the address of its page followed by this anchor (/#comment-<id>). The discussion draws every comment
// under it and scrolls to the one a link names.
const ANCHOR = 'comment-';
export const commentAnchor = (id) => `${ANCHOR}${id}`;

/** The id of the comment an anchor names, or null when it is something else (a heading, say). */
export const commentIdFromAnchor = (anchor) => (typeof anchor === 'string' && anchor.length > ANCHOR.length && anchor.startsWith(ANCHOR) ? anchor.slice(ANCHOR.length) : null);

/**
 * Where an item of activity is: a module (its `path`, and the comment to scroll to), an article (its address), or a feed post.
 * `item` is { id, path, kind, by, at, title?, slug? } as the API sends it.
 */
export function activityTarget(item) {
  if (item.path.startsWith(COMMENT_PATH_PREFIX)) return { type: 'article', slug: item.slug };
  if (item.path.startsWith(CHALLENGE_PATH_PREFIX)) return { type: 'challenge', key: item.path.slice(CHALLENGE_PATH_PREFIX.length) };
  if (item.path.startsWith(FEED_PATH_PREFIX)) return { type: 'post', id: item.path.slice(FEED_PATH_PREFIX.length) };
  return { type: 'module', path: item.path, anchor: commentAnchor(item.id) };
}

/** What the account menu says about an item: { what: 'Grace replied', where: 'the module, the article or the start of the post' }. */
export function describeActivity(item, moduleTitle) {
  const what = `${item.by || 'Someone'} ${item.kind === 'mention' ? 'mentioned you' : 'replied'}`;
  const target = activityTarget(item);
  if (target.type === 'article') return { what, where: item.title };
  if (target.type === 'challenge') return { what, where: item.title };
  if (target.type === 'post') return { what, where: `“${item.title}”` };
  return { what, where: moduleTitle(item.path) };
}
