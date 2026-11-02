// What a blog post and its author may be, in numbers and patterns. One place, used by the API (which enforces them), the
// studio (which tells the author before the server has to) and the tests.
export const BLOG = {
  titleMin: 3,
  titleMax: 140,
  subtitleMax: 200,
  excerptMax: 300,
  tagsMax: 5,
  // A published post has something to read: a near-empty one is more likely spam than writing.
  minWordsToPublish: 30,
  // The document, as JSON. D1 rows top out near 2 MB and a post this size is already a long read.
  docBytesMax: 200 * 1024,
  // Bounds on what one document can contain, so a hostile or broken client cannot make the server (or a reader) work for minutes.
  nodesMax: 20000,
  depthMax: 16,
  textMax: 20000,
  attributeMax: 300,
  hrefMax: 2048,
  bioMax: 300,
  nameMax: 60
};

/** A tag: lower case, starts with a letter or digit, may carry + # . - (c++, c#, node.js, event-driven). */
export const TAG_PATTERN = /^[a-z0-9][a-z0-9+#.-]{0,29}$/;
/** An author's handle in /authors/<handle>: 3 to 30 of a-z 0-9 and hyphens, not starting or ending with a hyphen. */
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
/** A code block's language name: what highlight.js and Mermaid are called. */
export const LANGUAGE_PATTERN = /^[a-z0-9][a-z0-9+#-]{0,19}$/;
/** A YouTube video id. */
export const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

// A handle or slug is a path segment of its own; these would collide with the app's own addresses.
export const RESERVED_HANDLES = new Set([
  'admin', 'api', 'about', 'authors', 'blog', 'blogs', 'edit', 'explore', 'feed', 'help', 'me', 'mine', 'new', 'null',
  'privacy', 'root', 'search', 'settings', 'support', 'tag', 'tags', 'terms', 'undefined', 'write'
]);
export const RESERVED_SLUGS = new Set(['new', 'edit', 'tag', 'tags', 'mine', 'authors', 'author', 'write', 'feed', 'search', 'rss', 'sitemap']);

/**
 * The callouts an article can have. The key is what is stored in the document; `cls` is the curriculum's own content
 * block (lib/markdown/contentBlocks.js), so a callout in an article is drawn by the same CSS as one in a module.
 */
export const CALLOUTS = {
  note: { label: 'Note', cls: 'note' },
  tip: { label: 'Tip', cls: 'tip' },
  key: { label: 'Key idea', cls: 'key' },
  warning: { label: 'Warning', cls: 'pitfall' }
};
export const CALLOUT_TONES = Object.keys(CALLOUTS);

/** A post's comments are rows of the comments table under this path (the feed's are 'feed:<id>'): the API and the app agree here. */
export const COMMENT_PATH_PREFIX = 'blog:';
export const commentPath = (postId) => COMMENT_PATH_PREFIX + postId;
