// Progress-sync endpoints only. Auth login/logout are deliberately NOT here —
// both are 302 redirects into Google's OAuth flow, and a fetch() would follow
// the redirect internally without ever navigating the browser. Those stay as
// raw window.location.href assignments in useAuth.

export async function fetchServerStatus() {
  const res = await fetch('/api/progress');
  if (!res.ok) throw new Error('progress fetch failed: ' + res.status);
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

export async function fetchAllComments() {
  const res = await fetch('/api/manage/comments');
  if (!res.ok) throw new Error('failed to load comments');
  return res.json();
}

export async function deleteComment(path, id) {
  const res = await fetch(`/api/manage/comments?path=${encodeURIComponent(path)}&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('failed to delete comment');
}

export async function fetchFeed() {
  const res = await fetch('/api/feed');
  if (!res.ok) throw new Error('failed to load feed');
  return res.json();
}

export async function postFeedItem(text, attachmentUrl, attachmentType) {
  const res = await fetch('/api/feed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, attachmentUrl, attachmentType })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'failed to post');
  }
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
