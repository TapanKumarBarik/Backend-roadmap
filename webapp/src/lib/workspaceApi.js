// The private workspace's revision lists, as the screens use them (api/routes/revision.js). The pages themselves are in lib/api.js.
// Every failure is an ApiError (lib/errors.js), so a screen can say what really happened.

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

/** The lessons on one revision list: [{ id, pageId, path, title, addedAt, lastRevisedAt, revisedCount }]. */
export const fetchRevisionItems = async (pageId) => answer(await fetch(`/api/workspace/pages/${encodeURIComponent(pageId)}/revision`), 'failed to load the revision list');

/** Puts a lesson on a given list. Resolves { item, added }; `added` is false when it was already there. */
export const addRevisionItem = async (pageId, path, title) => answer(await send('POST', `/api/workspace/pages/${encodeURIComponent(pageId)}/revision`, { path, title }), 'failed to add the lesson');

/** From a lesson's page: puts it on the person's first list (made if they have none). Resolves { item, added, listCreated }. */
export const addToRevisionList = async (path, title) => answer(await send('POST', '/api/workspace/revision', { path, title }), 'failed to add the lesson to your revision list');

/** "Revised today". Resolves the lesson as the server now has it. */
export const markRevisedToday = async (itemId) => answer(await send('POST', `/api/workspace/revision-items/${encodeURIComponent(itemId)}/revised`, {}), 'failed to save that');

export const removeRevisionItem = async (itemId) => answer(await send('DELETE', `/api/workspace/revision-items/${encodeURIComponent(itemId)}`), 'failed to remove the lesson');
