// Revision lists in the private workspace: lessons to come back to, each with when it was last revised. A list is a workspace page of
// kind "revision" (routes/workspace.js); its lessons are rows of revision_items. When a lesson is due again is worked out in the browser
// (webapp/src/lib/workspace/revision.js) from `lastRevisedAt` and `revisedCount`, so the server only keeps what happened.
// Everything is the owner's alone: a list or a lesson that is not yours is "not found".

import { createRouter } from '../lib/router.js';
import { all, batch, first, run } from '../lib/d1.js';
import { getSession } from '../lib/admin.js';
import { timeId } from '../lib/util.js';
import { KIND, LIMITS, cleanItemTitle, isLessonPath } from '../../webapp/src/lib/workspace/kinds.js';

const revision = createRouter();

// The list a lesson page adds to when it does not say which: the oldest one, made on the spot when there is none.
const DEFAULT_LIST_TITLE = 'Revision list';

async function requireSession(c) {
  const session = await getSession(c);
  if (!session) return { res: c.json({ error: 'unauthenticated' }, 401) };
  return { session };
}

const toItem = (row) => ({
  id: row.id,
  pageId: row.page_id,
  path: row.path,
  title: row.title,
  addedAt: row.added_at,
  lastRevisedAt: row.last_revised_at || null,
  revisedCount: row.revised_count || 0
});

const listOf = (env, userId, pageId) => first(
  env,
  `SELECT p.id FROM workspace_pages p JOIN workspace_meta m ON m.page_id = p.id
   WHERE p.user_id = ?1 AND p.id = ?2 AND m.kind = ?3`,
  userId, pageId, KIND.revision
);

async function readBody(c) {
  try {
    const body = await c.req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch { return null; }
}

/** Puts a lesson on a list: `{ item, added }`, or `{ response }` with what to send when it cannot be. Adding it twice is not an error. */
async function addLesson(c, userId, pageId, body) {
  if (!body || !isLessonPath(body.path)) return { response: c.json({ error: 'a lesson needs its path' }, 400) };
  const already = await first(c.env, 'SELECT * FROM revision_items WHERE user_id = ?1 AND page_id = ?2 AND path = ?3', userId, pageId, body.path);
  if (already) return { item: toItem(already), added: false };
  const count = await first(c.env, 'SELECT COUNT(*) AS n FROM revision_items WHERE user_id = ?1 AND page_id = ?2', userId, pageId);
  if (count.n >= LIMITS.revisionItemsMax) return { response: c.json({ error: `A revision list holds up to ${LIMITS.revisionItemsMax} lessons.` }, 400) };
  const row = {
    id: timeId(4),
    page_id: pageId,
    path: body.path,
    title: cleanItemTitle(body.title, body.path),
    added_at: new Date().toISOString(),
    last_revised_at: null,
    revised_count: 0
  };
  await run(
    c.env,
    'INSERT INTO revision_items (id, user_id, page_id, path, title, added_at, revised_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)',
    row.id, userId, row.page_id, row.path, row.title, row.added_at
  );
  return { item: toItem(row), added: true };
}

revision.get('/workspace/pages/:id/revision', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const id = c.req.param('id');
  if (!(await listOf(c.env, session.sub, id))) return c.json({ error: 'page not found' }, 404);
  const rows = await all(c.env, 'SELECT * FROM revision_items WHERE user_id = ?1 AND page_id = ?2 ORDER BY added_at, id', session.sub, id);
  return c.json(rows.map(toItem));
});

revision.post('/workspace/pages/:id/revision', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const id = c.req.param('id');
  if (!(await listOf(c.env, session.sub, id))) return c.json({ error: 'page not found' }, 404);
  const result = await addLesson(c, session.sub, id, await readBody(c));
  if (result.response) return result.response;
  return c.json({ item: result.item, added: result.added }, result.added ? 201 : 200);
});

// From a lesson page: the lesson goes on the person's first revision list, and the list is made if they have none yet.
revision.post('/workspace/revision', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const body = await readBody(c);

  let list = await first(
    c.env,
    `SELECT p.id FROM workspace_pages p JOIN workspace_meta m ON m.page_id = p.id
     WHERE p.user_id = ?1 AND m.kind = ?2 ORDER BY p.created_at, p.id LIMIT 1`,
    session.sub, KIND.revision
  );
  let created = false;
  if (!list) {
    if (!body || !isLessonPath(body.path)) return c.json({ error: 'a lesson needs its path' }, 400);
    const pages = await all(c.env, 'SELECT parent_id, sort_order FROM workspace_pages WHERE user_id = ?1', session.sub);
    if (pages.length >= LIMITS.pagesMax) return c.json({ error: `You can keep up to ${LIMITS.pagesMax} pages. Delete some to make room.` }, 400);
    const topLevel = pages.filter((p) => !p.parent_id && typeof p.sort_order === 'number').map((p) => p.sort_order);
    const now = new Date().toISOString();
    list = { id: timeId(4) };
    await batch(c.env, [
      [`INSERT INTO workspace_pages (id, user_id, title, parent_id, sort_order, content, created_at, updated_at)
        VALUES (?1, ?2, ?3, NULL, ?4, '', ?5, ?5)`, list.id, session.sub, DEFAULT_LIST_TITLE, Math.max(-1, ...topLevel) + 1, now],
      ['INSERT INTO workspace_meta (page_id, user_id, kind, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)', list.id, session.sub, KIND.revision, '{}', now]
    ]);
    created = true;
  }
  const result = await addLesson(c, session.sub, list.id, body);
  if (result.response) return result.response;
  return c.json({ item: result.item, added: result.added, listCreated: created }, result.added ? 201 : 200);
});

// "Revised today". Pressing it again on the same day changes nothing, so the lesson is not pushed further out by a double click.
revision.post('/workspace/revision-items/:id/revised', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const row = await first(c.env, 'SELECT * FROM revision_items WHERE user_id = ?1 AND id = ?2', session.sub, c.req.param('id'));
  if (!row) return c.json({ error: 'lesson not found' }, 404);
  const now = new Date().toISOString();
  if (row.last_revised_at && row.last_revised_at.slice(0, 10) === now.slice(0, 10)) return c.json(toItem(row));
  await run(
    c.env,
    'UPDATE revision_items SET last_revised_at = ?1, revised_count = revised_count + 1 WHERE user_id = ?2 AND id = ?3',
    now, session.sub, row.id
  );
  return c.json(toItem({ ...row, last_revised_at: now, revised_count: (row.revised_count || 0) + 1 }));
});

revision.delete('/workspace/revision-items/:id', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const row = await first(c.env, 'SELECT id FROM revision_items WHERE user_id = ?1 AND id = ?2', session.sub, c.req.param('id'));
  if (!row) return c.json({ error: 'lesson not found' }, 404);
  await run(c.env, 'DELETE FROM revision_items WHERE user_id = ?1 AND id = ?2', session.sub, row.id);
  return c.body(null, 204);
});

export default revision;
