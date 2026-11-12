// The public profile (api/routes/profile.js). Every failure is an ApiError (lib/errors.js), so a screen can say what really happened.
import { apiError } from './errors.js';

async function answer(res, fallback) {
  if (!res.ok) throw await apiError(res, fallback);
  return res.status === 204 ? null : res.json();
}
const send = (method, url, body) => fetch(url, {
  method,
  headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body)
});

/** The profile at a handle, { handle, displayName, snapshot, updatedAt }, or null when there is none. */
export async function fetchProfile(handle) {
  const res = await fetch(`/api/profiles/${encodeURIComponent(handle)}`);
  if (res.status === 404) return null;
  return answer(res, 'failed to load the profile');
}

/** The signed-in reader's own profile, or null when they have not published one. */
export const fetchMyProfile = async () => answer(await fetch('/api/profile'), 'failed to load your profile');

/** Publishes or updates the profile: { handle, displayName, snapshot }. */
export const saveProfile = async (profile) => answer(await send('PUT', '/api/profile', profile), 'failed to save your profile');

/** Takes the profile down. */
export const removeProfile = async () => answer(await send('DELETE', '/api/profile'), 'failed to take your profile down');
