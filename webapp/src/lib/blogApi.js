// The community's articles, as the screens use them (api/routes/blogs.js). Every failure is an ApiError (lib/errors.js),
// so a screen can say what really happened.

import { ApiError, apiError } from './errors.js';

/** Saving was refused because the article was saved from somewhere else in the meantime. `updatedAt` is the other version's. */
export class ConflictError extends ApiError {
  /** @type {string | undefined} */
  updatedAt;

  constructor(message, init, updatedAt) {
    super(message, init);
    this.name = 'ConflictError';
    this.updatedAt = updatedAt;
  }
}

/** Publishing was refused because the author has not chosen a handle and a name yet. */
export class ProfileRequiredError extends ApiError {
  constructor(message, init) {
    super(message, init);
    this.name = 'ProfileRequiredError';
  }
}

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

// ------------------------------------------------------------------------------------------ the studio: my own articles

/** Every article of mine, in every state, newest edit first: [{ id, slug, title, status, publishAt, words, likes, ... }]. */
export async function fetchMyBlogs() {
  return (await answer(await fetch('/api/blogs/mine'), 'failed to load your articles')).posts;
}

/** One of my articles with its document, to edit. */
export async function fetchMyBlog(id) {
  return (await answer(await fetch(`/api/blogs/mine/${encodeURIComponent(id)}`), 'failed to load the article')).post;
}

/** Starts a draft: { id, updatedAt }. */
export async function createBlog(title = '') {
  return answer(await send('POST', '/api/blogs', { title }), 'failed to start the article');
}

/**
 * Saves what is given (any of title, subtitle, excerpt, coverUrl, tags, content). `baseUpdatedAt` is the version this edit
 * started from: if the article was saved from somewhere else since, the answer is 409, thrown as a ConflictError, and
 * nothing is overwritten. Resolves { updatedAt, words, minutes, dropped, status }.
 */
export async function saveBlog(id, fields, baseUpdatedAt) {
  const res = await send('PUT', `/api/blogs/${encodeURIComponent(id)}`, { ...fields, ...(baseUpdatedAt ? { baseUpdatedAt } : {}) });
  if (res.status === 409) {
    const body = await res.clone().json().catch(() => ({}));
    throw new ConflictError(body.message || 'This article was changed somewhere else.', { status: 409, serverMessage: body.message || '', url: res.url }, body.updatedAt);
  }
  return answer(res, 'failed to save the article');
}

/** Publishes now, or at `publishAt` (an ISO time). Resolves { slug, status, publishAt, approved }; an author with no profile yet is a ProfileRequiredError. */
export async function publishBlog(id, publishAt) {
  const res = await send('POST', `/api/blogs/${encodeURIComponent(id)}/publish`, publishAt ? { publishAt } : {});
  if (res.status === 409) {
    const body = await res.clone().json().catch(() => ({}));
    if (body.error === 'profile_required') throw new ProfileRequiredError(body.message || 'Choose your author name before you publish.', { status: 409, serverMessage: body.message || '', url: res.url });
    throw await apiError(res, 'failed to publish the article');
  }
  return answer(res, 'failed to publish the article');
}

export async function unpublishBlog(id) {
  return answer(await send('POST', `/api/blogs/${encodeURIComponent(id)}/unpublish`), 'failed to unpublish the article');
}

export async function deleteBlog(id) {
  const res = await send('DELETE', `/api/blogs/${encodeURIComponent(id)}`);
  if (!res.ok) throw await apiError(res, 'failed to delete the article');
}

/** My author profile, or null before I have chosen a handle. */
export async function fetchMyProfile() {
  return (await answer(await fetch('/api/me/profile'), 'failed to load your author profile')).profile;
}

/** Saves { handle, name, bio, website, showAvatar }; resolves the profile as it is now shown. */
export async function saveMyProfile(profile) {
  return (await answer(await send('PUT', '/api/me/profile', profile), 'failed to save your author profile')).profile;
}

// ------------------------------------------------------------------------------------------------- moderation (admins)

/** Articles for the admin list: "pending" (live, not yet approved for search engines), "reported", "hidden", or all that are live. */
export async function fetchManagedBlogs(filter) {
  return (await answer(await fetch(`/api/manage/blogs${queryString({ filter })}`), 'failed to load the articles')).posts;
}

/** `action` is "approve", "hide" or "unhide". */
export async function moderateBlog(id, action) {
  return answer(await send('POST', `/api/manage/blogs/${encodeURIComponent(id)}/${action}`), 'failed to update the article');
}

/** A trusted author's articles are approved for search engines as they are published. */
export async function trustAuthor(handle, trusted) {
  return answer(await send('POST', `/api/manage/authors/${encodeURIComponent(handle)}/trust`, { trusted }), 'failed to update the author');
}

// ------------------------------------------------------------------------------------------------- the writing assistant

/** Whether the site has a writing assistant, and what it can do: { available, tasks, tones, maxInputChars }. */
export async function fetchAssistantStatus() {
  return answer(await fetch('/api/assistant/status'), 'failed to load the writing assistant');
}

/**
 * Asks the assistant for something. `task` is one of the status's tasks; `input` is { text, title, tone }. Resolves the result:
 * { text } or { titles } or { tags }, depending on the task. The answer is text to look at, never something that was changed.
 */
export async function runAssistant(task, input) {
  return (await answer(await send('POST', '/api/assistant/run', { task, ...input }), 'the assistant could not answer')).result;
}
