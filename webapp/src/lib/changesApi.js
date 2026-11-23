// The admin's staged changes (api/routes/changes.js), all admin-only. Its own file, so the readers' first download does not carry it: only the Admin
// screens and the admin's row on a lesson use it.
import { apiError } from './errors.js';

const post = async (url, body, fallback) => {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  if (!res.ok) throw await apiError(res, fallback);
  return res.json();
};

/** What is staged, with each diff, and the latest deploy: { branch, staged: [{ path, status, additions, deletions, patch }], deploy }. */
export async function fetchChanges() {
  const res = await fetch('/api/manage/changes');
  if (!res.ok) throw await apiError(res, 'failed to load the changes');
  return res.json();
}

/** Merges everything staged into main (the site's deploy starts by itself): { published, sha }. */
export const publishChanges = () => post('/api/manage/changes/publish', {}, 'failed to publish');

/** Throws away one staged edit (a lesson's path), or all of them (no path). */
export const discardChanges = (path) => post('/api/manage/changes/discard', path ? { path } : {}, 'failed to discard');

/** Starts the deploy of main as it is. */
export const startDeploy = () => post('/api/manage/deploy', {}, 'failed to start the deploy');
