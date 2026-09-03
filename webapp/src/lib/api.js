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
