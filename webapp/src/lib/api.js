// Progress-sync endpoints only. Auth login/logout are deliberately NOT here —
// both are 302 redirects into Google's OAuth flow, and a fetch() would follow
// the redirect internally without ever navigating the browser. Those stay as
// raw window.location.href assignments in useAuth.

export async function fetchServerStatus() {
  const res = await fetch('/api/progress');
  if (!res.ok) throw new Error('progress fetch failed: ' + res.status);
  return res.json();
}

// path -> ISO string of when that mark was last changed. Separate from
// fetchServerStatus because /api/progress's values are bare status strings
// that callers compare directly against 'done'; see the endpoint's comment.
export async function fetchServerTimes() {
  const res = await fetch('/api/progress/times');
  if (!res.ok) throw new Error('progress times fetch failed: ' + res.status);
  return res.json();
}

export function putServerStatus(path, status) {
  const url = '/api/progress/' + path.split('/').map(encodeURIComponent).join('/');
  return fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
}

export function resetServerStatus() {
  return fetch('/api/progress/reset', { method: 'POST' });
}

export async function fetchAuthUser() {
  const res = await fetch('/api/auth/me');
  const data = await res.json();
  return data && data.user ? data.user : null;
}

function encodedPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

export async function fetchComments(path) {
  const res = await fetch('/api/comments/' + encodedPath(path));
  if (!res.ok) throw new Error('failed to load comments');
  return res.json();
}

export async function postComment(path, text, parentId) {
  const res = await fetch('/api/comments/' + encodedPath(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, parentId: parentId || '' })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'failed to post comment');
  }
  return res.json();
}

export function trackPageView(path) {
  return fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  }).catch(() => {});
}

// Public: every question across the curriculum, with reply counts and
// whether it's been answered. Backs the Community screen's tabs.
export async function fetchQuestions() {
  const res = await fetch('/api/comments/questions');
  if (!res.ok) throw new Error('failed to load questions');
  return res.json();
}

export async function fetchAllComments() {
  const res = await fetch('/api/manage/comments');
  if (!res.ok) throw new Error('failed to load comments');
  return res.json();
}

export async function deleteComment(path, id) {
  const res = await fetch(`/api/manage/comments?path=${encodeURIComponent(path)}&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('failed to delete comment');
}

// A short-lived, shared cache: the feed is fetched from three independent
// call sites (FeedView, PostDetailView, useFeedActivity's badge check) that
// often mount within the same page load, and none of them needs data any
// fresher than a few seconds old. One in-flight request is shared instead of
// three, and a repeat call inside the TTL window skips the network entirely.
const FEED_CACHE_MS = 15000;
let feedCache = null; // { data, ts }
let feedInflight = null;

export async function fetchFeed() {
  const now = Date.now();
  if (feedCache && now - feedCache.ts < FEED_CACHE_MS) return feedCache.data;
  if (feedInflight) return feedInflight;
  feedInflight = fetch('/api/feed')
    .then((res) => {
      if (!res.ok) throw new Error('failed to load feed');
      return res.json();
    })
    .then((data) => {
      feedCache = { data, ts: Date.now() };
      feedInflight = null;
      return data;
    })
    .catch((err) => {
      feedInflight = null;
      throw err;
    });
  return feedInflight;
}

// Called after any write that makes the cached list stale (post, delete,
// vote) — cheaper than re-fetching immediately, since the caller usually
// already knows the one row that changed and can patch its own local state.
export function invalidateFeedCache() {
  feedCache = null;
}

// linkTitle only means anything when attachmentType is 'link' -- the
// poster's own label for a plain URL, never fetched/derived from it server-side.
export async function postFeedItem(text, attachmentUrl, attachmentType, linkTitle) {
  const res = await fetch('/api/feed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, attachmentUrl, attachmentType, linkTitle })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'failed to post');
  }
  invalidateFeedCache();
  return res.json();
}

export async function uploadFeedFile(filename, contentType, dataBase64) {
  const res = await fetch('/api/feed/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType, dataBase64 })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'upload failed');
  }
  return res.json();
}

export async function deleteFeedPost(id) {
  const res = await fetch('/api/manage/feed?id=' + encodeURIComponent(id), { method: 'DELETE' });
  if (!res.ok) throw new Error('failed to delete post');
  invalidateFeedCache();
}

export async function voteFeedPost(id) {
  const res = await fetch('/api/feed/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  if (!res.ok) throw new Error('failed to vote');
  invalidateFeedCache();
  return res.json();
}

// The user directory, joined with per-person activity counts, plus the
// current admin list. Admin-only.
export async function fetchPeople() {
  const res = await fetch('/api/manage/users');
  if (!res.ok) throw new Error('failed to load people');
  return res.json();
}

export async function grantAdmin(email) {
  const res = await fetch('/api/manage/admins', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'failed to grant admin access');
  }
  return res.json();
}

export async function revokeAdmin(email) {
  const res = await fetch('/api/manage/admins?email=' + encodeURIComponent(email), { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'failed to remove admin access');
  }
}

export async function fetchUsageStats() {
  const res = await fetch('/api/manage/usage');
  if (!res.ok) throw new Error('failed to load usage stats');
  return res.json();
}

export async function fetchPageViews() {
  const res = await fetch('/api/manage/pageviews');
  if (!res.ok) throw new Error('failed to load visitor stats');
  return res.json();
}

export async function fetchAdminContent(path) {
  const res = await fetch('/api/manage/content?path=' + encodeURIComponent(path));
  if (!res.ok) throw new Error('failed to load file (check the path)');
  return res.json();
}

export async function saveAdminContent(path, content, sha, message) {
  const res = await fetch('/api/manage/content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content, sha, message })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'failed to save');
  }
  return res.json();
}

export async function uploadAdminImage(filename, contentType, dataBase64) {
  const res = await fetch('/api/manage/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType, dataBase64 })
  });
  if (!res.ok) throw new Error('image upload failed');
  return res.json();
}

export async function editOwnComment(path, id, text) {
  const res = await fetch('/api/comments/edit', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, id, text })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'failed to edit comment');
  }
  return res.json();
}

export async function deleteOwnComment(path, id) {
  const res = await fetch(`/api/comments/own?path=${encodeURIComponent(path)}&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('failed to delete comment');
}

export async function fetchCommentActivity(since) {
  const res = await fetch('/api/comments/activity?since=' + encodeURIComponent(since));
  if (!res.ok) throw new Error('failed to load activity');
  return res.json();
}

export async function voteComment(path, id) {
  const res = await fetch('/api/comments/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, id })
  });
  if (!res.ok) throw new Error('failed to vote');
  return res.json();
}

export async function setCommentAnswer(path, id, isAnswer) {
  const res = await fetch('/api/manage/comments/answer', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, id, isAnswer })
  });
  if (!res.ok) throw new Error('failed to update answer state');
}

export async function fetchAllNotes() {
  const res = await fetch('/api/notes');
  if (!res.ok) throw new Error('failed to load notes');
  return res.json();
}

export async function fetchNote(path) {
  const res = await fetch('/api/notes/' + encodedPath(path));
  if (!res.ok) throw new Error('failed to load note');
  return res.json();
}

export async function saveNote(path, text) {
  const res = await fetch('/api/notes/' + encodedPath(path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) throw new Error('failed to save note');
}

export async function fetchBookmarks() {
  const res = await fetch('/api/bookmarks');
  if (!res.ok) throw new Error('failed to load bookmarks');
  return res.json();
}

export async function addBookmark(path) {
  const res = await fetch('/api/bookmarks/' + encodedPath(path), { method: 'PUT' });
  if (!res.ok) throw new Error('failed to add bookmark');
}

export async function removeBookmark(path) {
  const res = await fetch('/api/bookmarks/' + encodedPath(path), { method: 'DELETE' });
  if (!res.ok) throw new Error('failed to remove bookmark');
}

export async function fetchReactions(path) {
  const res = await fetch('/api/reactions/' + encodedPath(path));
  if (!res.ok) throw new Error('failed to load reactions');
  return res.json();
}

export async function toggleReaction(path, emoji) {
  const res = await fetch('/api/reactions/' + encodedPath(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji })
  });
  if (!res.ok) throw new Error('failed to react');
  return res.json();
}

export async function fetchStreak() {
  const res = await fetch('/api/streak');
  if (!res.ok) throw new Error('failed to load streak');
  return res.json();
}

// Deletes progress/notes/bookmarks/streaks/reactions outright, anonymizes
// this user's comments and pageview history in place, and signs them out
// server-side (clears the session cookie) — see api/src/functions/account.js
// for exactly what "delete my data" does to each table.
export async function deleteAccount() {
  const res = await fetch('/api/account', { method: 'DELETE' });
  if (!res.ok) throw new Error('failed to delete account');
}

export async function sendMessage(text) {
  const res = await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'failed to send message');
  }
}

export async function fetchMessages() {
  const res = await fetch('/api/manage/messages');
  if (!res.ok) throw new Error('failed to load messages');
  return res.json();
}

// A public, browsable shelf anyone signed in can add a book/PDF/link to —
// distinct from private per-user Notes and a one-off Feed attachment (see
// ROADMAP.md). File uploads reuse uploadFeedFile below rather than a
// separate endpoint.
export async function fetchBooks() {
  const res = await fetch('/api/books');
  if (!res.ok) throw new Error('failed to load books');
  return res.json();
}

export async function postBook(title, tag, linkUrl, attachmentUrl) {
  const res = await fetch('/api/books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, tag, linkUrl, attachmentUrl })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'failed to add book');
  }
  return res.json();
}

export async function deleteBook(id) {
  const res = await fetch('/api/manage/books?id=' + encodeURIComponent(id), { method: 'DELETE' });
  if (!res.ok) throw new Error('failed to delete book');
}

// A public, upvotable suggestions board — distinct from the private
// admin-only feedback inbox above (sendMessage/fetchMessages).
export async function fetchSuggestions() {
  const res = await fetch('/api/suggestions');
  if (!res.ok) throw new Error('failed to load suggestions');
  return res.json();
}

export async function postSuggestion(text) {
  const res = await fetch('/api/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'failed to post suggestion');
  }
  return res.json();
}

export async function voteSuggestion(id) {
  const res = await fetch('/api/suggestions/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  if (!res.ok) throw new Error('failed to vote');
  return res.json();
}

export async function deleteSuggestion(id) {
  const res = await fetch('/api/manage/suggestions?id=' + encodeURIComponent(id), { method: 'DELETE' });
  if (!res.ok) throw new Error('failed to delete suggestion');
}

// A private, per-user Notion-style workspace: nested pages, each holding a
// Tiptap block-editor document (text, todos, tables, images). Entirely
// personal — never shared, unlike Feed/Books/Suggestions above.
export async function fetchWorkspacePages() {
  const res = await fetch('/api/workspace/pages');
  if (!res.ok) throw new Error('failed to load workspace');
  return res.json();
}

export async function fetchWorkspacePage(id) {
  const res = await fetch('/api/workspace/pages/' + encodeURIComponent(id));
  if (!res.ok) throw new Error('failed to load page');
  return res.json();
}

export async function createWorkspacePage(title, parentId) {
  const res = await fetch('/api/workspace/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, parentId: parentId || null })
  });
  if (!res.ok) throw new Error('failed to create page');
  return res.json();
}

export async function updateWorkspacePage(id, patch) {
  const res = await fetch('/api/workspace/pages/' + encodeURIComponent(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'failed to save page');
  }
  return res.json();
}

export async function deleteWorkspacePage(id) {
  const res = await fetch('/api/workspace/pages/' + encodeURIComponent(id), { method: 'DELETE' });
  if (!res.ok) throw new Error('failed to delete page');
  return res.json();
}
