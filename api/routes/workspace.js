// The private, per-user Notion-style page tree, grown into a personal hub (migration 0006): a page is plain text, a folder, a study plan,
// a revision list (routes/revision.js) or a saved diagram. Partitioned by userId; every query is scoped `WHERE user_id = ?`, and a page
// that is not yours is "not found", never "forbidden". Nothing here is ever readable by anyone else.

import { createRouter } from '../lib/router.js';
import { all, first, batch } from '../lib/d1.js';
import { getSession } from '../lib/admin.js';
import { timeId } from '../lib/util.js';
import { withDescendants } from '../lib/workspaceData.js';
import { CONTAINER_KINDS, DATA_KINDS, KIND, LIMITS, TEXT_KINDS, cleanData, isKind } from '../../webapp/src/lib/workspace/kinds.js';

const workspace = createRouter();

// A page with its kind and data; a page with no workspace_meta row is a plain text page.
const WITH_META = `SELECT p.*, m.kind AS kind, m.data AS data
  FROM workspace_pages p LEFT JOIN workspace_meta m ON m.page_id = p.id WHERE p.user_id = ?1`;

async function requireSession(c) {
  const session = await getSession(c);
  if (!session) return { res: c.json({ error: 'unauthenticated' }, 401) };
  return { session };
}

function toClientShape(e) {
  return {
    id: e.id,
    parentId: e.parent_id || null,
    title: e.title,
    order: e.sort_order,
    kind: e.kind || KIND.page,
    createdAt: e.created_at,
    updatedAt: e.updated_at
  };
}

function parse(json) {
  try { return json ? JSON.parse(json) : null; } catch { return null; }
}

const byteLength = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');

/** Can `parent` (a row from WITH_META, or undefined) hold pages? Answers with the error to send, or null. */
function parentProblem(c, parent) {
  if (!parent) return c.json({ error: 'page not found' }, 404);
  if (!CONTAINER_KINDS.has(parent.kind || KIND.page)) return c.json({ error: 'only a page or a folder can have pages inside it' }, 400);
  return null;
}

workspace.get('/workspace/pages', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const rows = await all(
    c.env,
    `SELECT p.id, p.parent_id, p.title, p.sort_order, p.created_at, p.updated_at, m.kind AS kind
     FROM workspace_pages p LEFT JOIN workspace_meta m ON m.page_id = p.id WHERE p.user_id = ?1`,
    session.sub
  );
  return c.json(rows.map(toClientShape));
});

workspace.get('/workspace/pages/:id', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const row = await first(c.env, `${WITH_META} AND p.id = ?2`, session.sub, c.req.param('id'));
  if (!row) return c.json({ error: 'page not found' }, 404);
  return c.json({ ...toClientShape(row), content: parse(row.content), data: row.kind ? parse(row.data) : null });
});

workspace.post('/workspace/pages', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;

  let body;
  try { body = await c.req.json(); } catch { body = {}; }
  if (!body || typeof body !== 'object') body = {};
  const kind = body.kind === undefined ? KIND.page : body.kind;
  if (!isKind(kind)) return c.json({ error: 'that is not a kind of page' }, 400);
  const title = typeof body.title === 'string' && body.title.trim()
    ? body.title.trim().slice(0, LIMITS.titleMax) : 'Untitled';
  const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null;

  const existing = await all(c.env, WITH_META, session.sub);
  if (existing.length >= LIMITS.pagesMax) return c.json({ error: `You can keep up to ${LIMITS.pagesMax} pages. Delete some to make room.` }, 400);
  if (parentId) {
    const problem = parentProblem(c, existing.find((p) => p.id === parentId));
    if (problem) return problem;
  }

  // Everything but a plain page keeps something beside it. A diagram starts empty; a plan needs its steps.
  let data = {};
  if (DATA_KINDS.has(kind)) {
    const given = body.data === undefined && kind === KIND.diagram ? { source: '' } : body.data;
    const cleaned = cleanData(kind, given);
    if (cleaned.problem) return c.json({ error: cleaned.problem }, 400);
    if (byteLength(cleaned.data) > LIMITS.dataBytesMax) return c.json({ error: 'this is too large to keep' }, 400);
    data = cleaned.data;
  }

  let maxOrder = -1;
  for (const s of existing) {
    if ((s.parent_id || null) === parentId && typeof s.sort_order === 'number' && s.sort_order > maxOrder) maxOrder = s.sort_order;
  }

  const now = new Date().toISOString();
  const row = {
    id: timeId(4),
    parent_id: parentId,
    title,
    sort_order: maxOrder + 1,
    kind: kind === KIND.page ? null : kind,
    created_at: now,
    updated_at: now
  };
  await batch(c.env, [
    [`INSERT INTO workspace_pages (id, user_id, title, parent_id, sort_order, content, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, ?7)`,
    row.id, session.sub, row.title, row.parent_id, row.sort_order, row.created_at, row.updated_at],
    ...(row.kind ? [['INSERT INTO workspace_meta (page_id, user_id, kind, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)',
      row.id, session.sub, row.kind, JSON.stringify(data), now]] : [])
  ]);
  return c.json({ ...toClientShape(row), content: null, data: row.kind ? data : null }, 201);
});

workspace.put('/workspace/pages/:id', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const id = c.req.param('id');

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }
  if (!body || typeof body !== 'object') return c.json({ error: 'invalid body' }, 400);

  const allRows = await all(c.env, WITH_META, session.sub);
  const existing = allRows.find((p) => p.id === id);
  if (!existing) return c.json({ error: 'page not found' }, 404);
  const kind = existing.kind || KIND.page;

  const sets = [];
  const vals = [];
  let n = 0;
  sets.push(`updated_at = ?${++n}`); vals.push(new Date().toISOString());

  if (typeof body.title === 'string') {
    sets.push(`title = ?${++n}`);
    vals.push(body.title.trim().slice(0, LIMITS.titleMax) || 'Untitled');
  }
  if (typeof body.content !== 'undefined') {
    if (!TEXT_KINDS.has(kind)) return c.json({ error: 'this kind of page has no text' }, 400);
    const serialized = JSON.stringify(body.content);
    if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > LIMITS.contentBytesMax) {
      return c.json({ error: 'page content is too large' }, 400);
    }
    sets.push(`content = ?${++n}`);
    vals.push(serialized);
  }
  if (typeof body.parentId !== 'undefined') {
    if (body.parentId === id) return c.json({ error: 'a page cannot be its own parent' }, 400);
    if (body.parentId) {
      if (typeof body.parentId !== 'string') return c.json({ error: 'invalid parent' }, 400);
      const problem = parentProblem(c, allRows.find((p) => p.id === body.parentId));
      if (problem) return problem;
      if (withDescendants(allRows, id).has(body.parentId)) return c.json({ error: 'cannot move a page into its own descendant' }, 400);
    }
    sets.push(`parent_id = ?${++n}`);
    vals.push(body.parentId || null);
  }
  if (typeof body.order === 'number' && Number.isFinite(body.order)) {
    sets.push(`sort_order = ?${++n}`);
    vals.push(body.order);
  }

  const writes = [];
  if (typeof body.data !== 'undefined') {
    if (!DATA_KINDS.has(kind)) return c.json({ error: 'this kind of page keeps no data' }, 400);
    const cleaned = cleanData(kind, body.data);
    if (cleaned.problem) return c.json({ error: cleaned.problem }, 400);
    if (byteLength(cleaned.data) > LIMITS.dataBytesMax) return c.json({ error: 'this is too large to keep' }, 400);
    writes.push(['UPDATE workspace_meta SET data = ?1 WHERE user_id = ?2 AND page_id = ?3', JSON.stringify(cleaned.data), session.sub, id]);
  }

  await batch(c.env, [
    [`UPDATE workspace_pages SET ${sets.join(', ')} WHERE user_id = ?${++n} AND id = ?${++n}`, ...vals, session.sub, id],
    ...writes
  ]);

  const updated = await first(c.env, `${WITH_META} AND p.id = ?2`, session.sub, id);
  return c.json(toClientShape(updated));
});

workspace.delete('/workspace/pages/:id', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const id = c.req.param('id');

  const allRows = await all(c.env, WITH_META, session.sub);
  if (!allRows.some((p) => p.id === id)) return c.json({ error: 'page not found' }, 404);

  const toDelete = withDescendants(allRows, id);
  const withKind = allRows.filter((p) => toDelete.has(p.id) && p.kind);
  await batch(c.env, [
    ...[...toDelete].map((rowId) => ['DELETE FROM workspace_pages WHERE user_id = ?1 AND id = ?2', session.sub, rowId]),
    ...withKind.map((p) => ['DELETE FROM workspace_meta WHERE user_id = ?1 AND page_id = ?2', session.sub, p.id]),
    ...withKind.filter((p) => p.kind === KIND.revision).map((p) => ['DELETE FROM revision_items WHERE user_id = ?1 AND page_id = ?2', session.sub, p.id])
  ]);
  return c.json({ deletedIds: [...toDelete] });
});

export default workspace;
