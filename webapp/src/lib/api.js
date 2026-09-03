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
