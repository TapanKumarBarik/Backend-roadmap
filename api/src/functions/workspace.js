const { app } = require('@azure/functions');
const crypto = require('crypto');
const { getTable } = require('../lib/tableClient');
const { getSession } = require('../lib/adminAuth');

// Entirely private, per-user — same privacy model as notes.js, not a
// public/shared surface like Feed, Books, or Suggestions. Partitioned by
// userId, so one user's pages are a single, cheap partition scan and never
// visible to anyone else's queries.
const TABLE_NAME = 'WorkspacePages';
const MAX_TITLE_LENGTH = 200;
// A ProseMirror doc (Tiptap's editor.getJSON() output) for a genuinely long
// page with tables/images can run large; well under Table Storage's 64KB
// per-property string cap for any realistic single page, generous enough
// not to be a real constraint for a personal notes page.
const MAX_CONTENT_BYTES = 200 * 1024;

function makeId() {
  return String(Date.now()).padStart(13, '0') + '-' + crypto.randomBytes(4).toString('hex');
}

function toClientShape(entity) {
  return {
    id: entity.rowKey,
    parentId: entity.parentId || null,
    title: entity.title,
    order: entity.order,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt
  };
}

// Tree metadata only (id/parentId/title/order) — NOT each page's full
// content, so opening the workspace loads one cheap list rather than every
// page's entire ProseMirror doc up front.
app.http('listWorkspacePages', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'workspace/pages',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    const table = getTable(TABLE_NAME);
    const out = [];
    for await (const entity of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${session.sub}'` } })) {
      out.push(toClientShape(entity));
    }
    return { jsonBody: out };
  }
});

app.http('getWorkspacePage', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'workspace/pages/{id}',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    const id = request.params.id;
    const table = getTable(TABLE_NAME);
    let entity;
    try {
      entity = await table.getEntity(session.sub, id);
    } catch (err) {
      if (err.statusCode === 404) return { status: 404, jsonBody: { error: 'page not found' } };
      throw err;
    }
    let content = null;
    try { content = entity.content ? JSON.parse(entity.content) : null; } catch { content = null; }
    return { jsonBody: { ...toClientShape(entity), content } };
  }
});

app.http('createWorkspacePage', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'workspace/pages',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    let body;
    try { body = await request.json(); } catch { body = {}; }
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, MAX_TITLE_LENGTH) : 'Untitled';
    const parentId = typeof body.parentId === 'string' ? body.parentId : null;

    // A new page sorts after every existing sibling — cheap to compute since
    // the whole partition is already a small, personal-scale list (module-
    // count-adjacent, not a public table).
    const table = getTable(TABLE_NAME);
    let maxOrder = -1;
    for await (const entity of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${session.sub}'` } })) {
      const sameParent = (entity.parentId || null) === parentId;
      if (sameParent && typeof entity.order === 'number' && entity.order > maxOrder) maxOrder = entity.order;
    }

    const now = new Date().toISOString();
    const entity = {
      partitionKey: session.sub,
      rowKey: makeId(),
      parentId,
      title,
      content: '',
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now
    };
    await table.createEntity(entity);
    return { status: 201, jsonBody: { ...toClientShape(entity), content: null } };
  }
});

app.http('updateWorkspacePage', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'workspace/pages/{id}',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    const id = request.params.id;
    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'invalid body' } }; }

    const table = getTable(TABLE_NAME);
    let existing;
    try {
      existing = await table.getEntity(session.sub, id);
    } catch (err) {
      if (err.statusCode === 404) return { status: 404, jsonBody: { error: 'page not found' } };
      throw err;
    }

    const patch = { partitionKey: session.sub, rowKey: id, updatedAt: new Date().toISOString() };
    if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, MAX_TITLE_LENGTH) || 'Untitled';
    if (typeof body.content !== 'undefined') {
      const serialized = JSON.stringify(body.content);
      if (Buffer.byteLength(serialized, 'utf8') > MAX_CONTENT_BYTES) {
        return { status: 400, jsonBody: { error: 'page content is too large' } };
      }
      patch.content = serialized;
    }
    if (typeof body.parentId !== 'undefined') {
      // A page can't become its own descendant's child — walk the existing
      // parent chain from the proposed new parent and reject if it passes
      // through this page.
      if (body.parentId === id) return { status: 400, jsonBody: { error: 'a page cannot be its own parent' } };
      if (body.parentId) {
        const all = [];
        for await (const e of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${session.sub}'` } })) all.push(e);
        let cursor = body.parentId;
        const seen = new Set();
        while (cursor) {
          if (cursor === id) return { status: 400, jsonBody: { error: 'cannot move a page into its own descendant' } };
          if (seen.has(cursor)) break;
          seen.add(cursor);
          const node = all.find((e) => e.rowKey === cursor);
          cursor = node ? node.parentId || null : null;
        }
      }
      patch.parentId = body.parentId || null;
    }
    if (typeof body.order === 'number') patch.order = body.order;

    await table.updateEntity(patch, 'Merge');
    const updated = await table.getEntity(session.sub, id);
    return { jsonBody: toClientShape(updated) };
  }
});

// Cascades to descendants — Table Storage has no referential integrity, and
// leaving orphaned child pages behind (parentId pointing at a deleted page)
// would strand them, unreachable from the tree, but not actually gone.
app.http('deleteWorkspacePage', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'workspace/pages/{id}',
  handler: async (request) => {
    const session = getSession(request);
    if (!session) return { status: 401, jsonBody: { error: 'unauthenticated' } };

    const id = request.params.id;
    const table = getTable(TABLE_NAME);
    const all = [];
    for await (const e of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${session.sub}'` } })) all.push(e);

    const toDelete = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of all) {
        if (e.parentId && toDelete.has(e.parentId) && !toDelete.has(e.rowKey)) {
          toDelete.add(e.rowKey);
          grew = true;
        }
      }
    }

    for (const rowKey of toDelete) {
      try {
        await table.deleteEntity(session.sub, rowKey);
      } catch (err) {
        if (err.statusCode !== 404) throw err;
      }
    }
    return { jsonBody: { deletedIds: [...toDelete] } };
  }
});
