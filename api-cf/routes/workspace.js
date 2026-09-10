// Port of api/src/functions/workspace.js — a private, per-user Notion-style
// page tree. Partitioned by userId in Table Storage; here every query is
// scoped `WHERE user_id = ?` and the table is indexed on user_id.

import { Hono } from 'hono';
import { all, first, run, batch } from '../lib/d1.js';
import { getSession } from '../lib/admin.js';
import { timeId } from '../lib/util.js';

const workspace = new Hono();

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_BYTES = 200 * 1024;

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
    createdAt: e.created_at,
    updatedAt: e.updated_at
  };
}

workspace.get('/workspace/pages', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const rows = await all(
    c.env,
    'SELECT id, parent_id, title, sort_order, created_at, updated_at FROM workspace_pages WHERE user_id = ?1',
    session.sub
  );
  return c.json(rows.map(toClientShape));
});

workspace.get('/workspace/pages/:id', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const row = await first(
    c.env, 'SELECT * FROM workspace_pages WHERE user_id = ?1 AND id = ?2', session.sub, c.req.param('id')
  );
  if (!row) return c.json({ error: 'page not found' }, 404);
  let content = null;
  try { content = row.content ? JSON.parse(row.content) : null; } catch { content = null; }
  return c.json({ ...toClientShape(row), content });
});

workspace.post('/workspace/pages', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;

  let body;
  try { body = await c.req.json(); } catch { body = {}; }
  const title = typeof body.title === 'string' && body.title.trim()
    ? body.title.trim().slice(0, MAX_TITLE_LENGTH) : 'Untitled';
  const parentId = typeof body.parentId === 'string' ? body.parentId : null;

  const siblings = await all(
    c.env, 'SELECT parent_id, sort_order FROM workspace_pages WHERE user_id = ?1', session.sub
  );
  let maxOrder = -1;
  for (const s of siblings) {
    if ((s.parent_id || null) === parentId && typeof s.sort_order === 'number' && s.sort_order > maxOrder) {
      maxOrder = s.sort_order;
    }
  }

  const now = new Date().toISOString();
  const row = {
    id: timeId(4),
    parent_id: parentId,
    title,
    sort_order: maxOrder + 1,
    created_at: now,
    updated_at: now
  };
  await run(
    c.env,
    `INSERT INTO workspace_pages (id, user_id, title, parent_id, sort_order, content, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, ?7)`,
    row.id, session.sub, row.title, row.parent_id, row.sort_order, row.created_at, row.updated_at
  );
  return c.json({ ...toClientShape(row), content: null }, 201);
});

workspace.put('/workspace/pages/:id', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const id = c.req.param('id');

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }

  const existing = await first(
    c.env, 'SELECT * FROM workspace_pages WHERE user_id = ?1 AND id = ?2', session.sub, id
  );
  if (!existing) return c.json({ error: 'page not found' }, 404);

  const sets = [];
  const vals = [];
  let n = 0;
  sets.push(`updated_at = ?${++n}`); vals.push(new Date().toISOString());

  if (typeof body.title === 'string') {
    sets.push(`title = ?${++n}`);
    vals.push(body.title.trim().slice(0, MAX_TITLE_LENGTH) || 'Untitled');
  }
  if (typeof body.content !== 'undefined') {
    const serialized = JSON.stringify(body.content);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_CONTENT_BYTES) {
      return c.json({ error: 'page content is too large' }, 400);
    }
    sets.push(`content = ?${++n}`);
    vals.push(serialized);
  }
  if (typeof body.parentId !== 'undefined') {
    if (body.parentId === id) return c.json({ error: 'a page cannot be its own parent' }, 400);
    if (body.parentId) {
      const allRows = await all(
        c.env, 'SELECT id, parent_id FROM workspace_pages WHERE user_id = ?1', session.sub
      );
      let cursor = body.parentId;
      const seen = new Set();
      while (cursor) {
        if (cursor === id) return c.json({ error: 'cannot move a page into its own descendant' }, 400);
        if (seen.has(cursor)) break;
        seen.add(cursor);
        const node = allRows.find((e) => e.id === cursor);
        cursor = node ? node.parent_id || null : null;
      }
    }
    sets.push(`parent_id = ?${++n}`);
    vals.push(body.parentId || null);
  }
  if (typeof body.order === 'number') {
    sets.push(`sort_order = ?${++n}`);
    vals.push(body.order);
  }

  await run(
    c.env,
    `UPDATE workspace_pages SET ${sets.join(', ')} WHERE user_id = ?${++n} AND id = ?${++n}`,
    ...vals, session.sub, id
  );

  const updated = await first(
    c.env, 'SELECT * FROM workspace_pages WHERE user_id = ?1 AND id = ?2', session.sub, id
  );
  return c.json(toClientShape(updated));
});

workspace.delete('/workspace/pages/:id', async (c) => {
  const { session, res } = await requireSession(c);
  if (res) return res;
  const id = c.req.param('id');

  const allRows = await all(
    c.env, 'SELECT id, parent_id FROM workspace_pages WHERE user_id = ?1', session.sub
  );

  const toDelete = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of allRows) {
      if (e.parent_id && toDelete.has(e.parent_id) && !toDelete.has(e.id)) {
        toDelete.add(e.id);
        grew = true;
      }
    }
  }

  await batch(
    c.env,
    [...toDelete].map((rowId) => ['DELETE FROM workspace_pages WHERE user_id = ?1 AND id = ?2', session.sub, rowId])
  );
  return c.json({ deletedIds: [...toDelete] });
});

export default workspace;
