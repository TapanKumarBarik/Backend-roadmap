// The community's articles, as the screens use them (api/routes/blogs.js). Every failure is an ApiError (lib/errors.js),
// so a screen can say what really happened.

import { apiError } from './errors.js';

async function answer(res, fallback) {
  if (!res.ok) throw await apiError(res, fallback);
  return res.json();
}

const send = (method, url, body) => fetch(url, {
  method,
  headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body)
});

/** `?a=1&b=2` from the values that are set, or an empty string. */
function queryString(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, String(value));
  const text = query.toString();
  return text ? `?${text}` : '';
}

/**
 * One page of the listing: { posts, next }. `next` is the cursor for the page after it, or null.
 * @param {{ q?: string, tag?: string, author?: string, sort?: string, cursor?: string | null, limit?: number }} [filters]
 */
export async function fetchBlogs({ q, tag, author, sort, cursor, limit } = {}) {
  return answer(await fetch(`/api/blogs${queryString({ q, tag, author, sort, cursor, limit })}`), 'failed to load articles');
}

/** The topics in use, most written about first: { tags: [{ tag, posts }] }. */
export async function fetchBlogTags() {
  return answer(await fetch('/api/blogs/tags'), 'failed to load topics');
}

/** One published article, drawn: { id, slug, title, html, toc, tags, author, liked, bookmarked, ... }. */
export async function fetchBlogPost(slug) {
  return (await answer(await fetch(`/api/blogs/${encodeURIComponent(slug)}`), 'failed to load the article')).post;
}

/** An author's public page: { handle, name, bio, website, avatarUrl, since, posts, likes }. */
export async function fetchAuthor(handle) {
  return (await answer(await fetch(`/api/authors/${encodeURIComponent(handle)}`), 'failed to load the author')).author;
}

/** The signed-in reader's bookmarked articles. */
export async function fetchSavedBlogs() {
  return (await answer(await fetch('/api/blogs/saved'), 'failed to load saved articles')).posts;
}

/** Likes or unlikes: { liked, likes }. */
export async function toggleBlogLike(id) {
  return answer(await send('POST', `/api/blogs/${encodeURIComponent(id)}/like`), 'failed to like the article');
}

/** Bookmarks or removes the bookmark: { bookmarked }. */
export async function toggleBlogBookmark(id) {
  return answer(await send('POST', `/api/blogs/${encodeURIComponent(id)}/bookmark`), 'failed to save the article');
}

/** Sends a picture for an article to the site's own storage; the answer's `url` is what goes in the document. */
export async function uploadArticleImage(file) {
  const dataBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const res = await send('POST', '/api/feed/upload?for=article', { filename: file.name, contentType: file.type, dataBase64 });
  return answer(res, 'failed to upload the picture');
}

export async function reportBlogPost(id, reason) {
  return answer(await send('POST', `/api/blogs/${encodeURIComponent(id)}/report`, { reason }), 'failed to send the report');
}
