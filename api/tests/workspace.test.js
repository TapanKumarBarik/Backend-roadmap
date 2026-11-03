// The private workspace: pages, and what the hub adds to them (folders, study plans, saved diagrams). Everything is the owner's alone, a
// page that is not yours is "not found", what is sent is checked and limited, and deleting the account takes all of it.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { LIMITS } from '../../webapp/src/lib/workspace/kinds.js';
import { DROP_REFUSAL, childrenOf, planDrop } from '../../webapp/src/lib/workspace/tree.js';
import { createEnv, signedInAs } from './helpers.js';

let env;
let ada;
let grace;
beforeEach(async () => {
  env = createEnv();
  ada = await signedInAs('ada@example.com');
  grace = await signedInAs('grace@example.com');
});

const call = (cookie, method, path, body) => app.request(`/api${path}`, {
  method,
  headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
  body: body !== undefined ? JSON.stringify(body) : undefined
}, env);
const json = async (res) => res.json();
const raw = (sql, ...params) => env.DB.raw.prepare(sql).all(...params).map((row) => ({ ...row }));
const count = (table, where = '1 = 1', ...params) => raw(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, ...params)[0].n;

async function create(cookie, body) {
  const res = await call(cookie, 'POST', '/workspace/pages', body);
  assert.equal(res.status, 201, JSON.stringify(await res.clone().json()));
  return json(res);
}

const PLAN = {
  source: 'path',
  pathId: 'backend-foundations',
  targetDate: '2030-01-31',
  steps: [
    { title: 'Requests', items: [
      { id: 'i1', type: 'lesson', path: 'backend/01/01/README.md', title: 'HTTP basics' },
      { id: 'i2', type: 'task', title: 'Write a tiny server', done: false }
    ] }
  ]
};

test('a plain page works exactly as it did before the hub: no kind sent, no kind row, text saved', async () => {
  const page = await create(ada, { title: 'Notes' });
  assert.equal(page.kind, 'page');
  assert.equal(page.data, null);
  assert.equal(count('workspace_meta'), 0, 'a plain page has nothing beside it');

  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] };
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${page.id}`, { content: doc })).status, 200);
  const read = await json(await call(ada, 'GET', `/workspace/pages/${page.id}`));
  assert.deepEqual(read.content, doc);
  assert.equal(read.kind, 'page');
  const list = await json(await call(ada, 'GET', '/workspace/pages'));
  assert.deepEqual(list.map((p) => [p.id, p.kind]), [[page.id, 'page']]);
});

test('a page made before the hub (a row with no kind) is listed as a plain page', async () => {
  const now = new Date().toISOString();
  env.DB.raw.prepare('INSERT INTO workspace_pages (id, user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('old', 'user-ada@example.com', 'Old page', '{"type":"doc"}', now, now);
  const list = await json(await call(ada, 'GET', '/workspace/pages'));
  assert.deepEqual(list.map((p) => [p.id, p.kind]), [['old', 'page']]);
});

test('every workspace route answers a visitor who has not signed in with 401', async () => {
  for (const [method, path, body] of [
    ['GET', '/workspace/pages'], ['GET', '/workspace/pages/x'], ['POST', '/workspace/pages', {}], ['PUT', '/workspace/pages/x', {}], ['DELETE', '/workspace/pages/x']
  ]) {
    assert.equal((await call(null, method, path, body)).status, 401, `${method} ${path}`);
  }
});

test('a folder holds pages and folders, can be moved into, and deleting it deletes everything inside it', async () => {
  const folder = await create(ada, { title: 'Databases', kind: 'folder' });
  assert.equal(folder.kind, 'folder');
  const inside = await create(ada, { title: 'Indexes', parentId: folder.id });
  const nested = await create(ada, { title: 'Deep', kind: 'folder', parentId: folder.id });
  const deeper = await create(ada, { title: 'Deeper', parentId: nested.id });
  const outside = await create(ada, { title: 'Elsewhere' });

  const list = await json(await call(ada, 'GET', '/workspace/pages'));
  assert.deepEqual(list.find((p) => p.id === inside.id).parentId, folder.id);

  // an existing page moves into a folder, and out again
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${outside.id}`, { parentId: folder.id })).status, 200);
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${outside.id}`, { parentId: null })).status, 200);

  const res = await call(ada, 'DELETE', `/workspace/pages/${folder.id}`);
  assert.equal(res.status, 200);
  assert.deepEqual((await json(res)).deletedIds.sort(), [folder.id, inside.id, nested.id, deeper.id].sort());
  assert.deepEqual(raw('SELECT id FROM workspace_pages').map((r) => r.id), [outside.id]);
  assert.equal(count('workspace_meta'), 0, 'the folders\' rows go with them');
});

test('a folder cannot be moved into itself or something inside it, and nothing can be put inside a plan, a diagram or a revision list', async () => {
  const outer = await create(ada, { kind: 'folder', title: 'Outer' });
  const inner = await create(ada, { kind: 'folder', title: 'Inner', parentId: outer.id });
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${outer.id}`, { parentId: inner.id })).status, 400);
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${outer.id}`, { parentId: outer.id })).status, 400);

  const plan = await create(ada, { kind: 'plan', title: 'Plan', data: PLAN });
  const diagram = await create(ada, { kind: 'diagram', title: 'Diagram' });
  const list = await create(ada, { kind: 'revision', title: 'Revise' });
  for (const leaf of [plan, diagram, list]) {
    assert.equal((await call(ada, 'POST', '/workspace/pages', { title: 'Child', parentId: leaf.id })).status, 400, `${leaf.kind} holds no pages`);
    const page = await create(ada, { title: 'A page' });
    assert.equal((await call(ada, 'PUT', `/workspace/pages/${page.id}`, { parentId: leaf.id })).status, 400);
  }
});

test('another account\'s pages are "not found" for reading, writing, moving into and deleting', async () => {
  const mine = await create(ada, { title: 'Mine' });
  const folder = await create(ada, { title: 'My folder', kind: 'folder' });
  const plan = await create(ada, { kind: 'plan', title: 'My plan', data: PLAN });

  assert.equal((await call(grace, 'GET', `/workspace/pages/${mine.id}`)).status, 404);
  assert.equal((await call(grace, 'PUT', `/workspace/pages/${mine.id}`, { title: 'Hijacked' })).status, 404);
  assert.equal((await call(grace, 'PUT', `/workspace/pages/${plan.id}`, { data: PLAN })).status, 404);
  assert.equal((await call(grace, 'DELETE', `/workspace/pages/${mine.id}`)).status, 404);
  const hers = await create(grace, { title: 'Hers' });
  assert.equal((await call(grace, 'PUT', `/workspace/pages/${hers.id}`, { parentId: folder.id })).status, 404, 'cannot move her page into my folder');
  assert.equal((await call(grace, 'POST', '/workspace/pages', { title: 'Sneaky', parentId: folder.id })).status, 404, 'cannot make a page in my folder');
  assert.deepEqual(await json(await call(grace, 'GET', '/workspace/pages')), [hers].map((p) => ({ id: p.id, parentId: null, title: 'Hers', order: 0, kind: 'page', createdAt: p.createdAt, updatedAt: p.updatedAt })));

  assert.equal(count('workspace_pages', 'user_id = ?', 'user-ada@example.com'), 3, 'nothing of mine was touched');
  assert.equal(raw('SELECT title FROM workspace_pages WHERE id = ?', mine.id)[0].title, 'Mine');
});

test('a study plan keeps its steps and target date, and its ticks are saved', async () => {
  const plan = await create(ada, { kind: 'plan', title: 'Backend plan', data: PLAN });
  assert.equal(plan.kind, 'plan');
  assert.deepEqual(plan.data, PLAN);

  const ticked = structuredClone(PLAN);
  ticked.steps[0].items[1].done = true;
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${plan.id}`, { data: ticked })).status, 200);
  const read = await json(await call(ada, 'GET', `/workspace/pages/${plan.id}`));
  assert.equal(read.data.steps[0].items[1].done, true);

  // notes under the plan are a document like any page's
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${plan.id}`, { content: { type: 'doc', content: [] } })).status, 200);
});

test('a plan is rebuilt from an allow-list: unknown fields and a lesson\'s tick are not kept', async () => {
  const sneaky = structuredClone(PLAN);
  sneaky.extra = '<script>';
  sneaky.steps[0].items[0].done = true; // a lesson's tick is its own progress, never the plan's
  sneaky.steps[0].items[0].html = '<b>';
  const plan = await create(ada, { kind: 'plan', title: 'Plan', data: sneaky });
  assert.deepEqual(plan.data, PLAN);
});

test('a plan that is not usable is refused with a reason', async () => {
  const bad = (change) => { const copy = structuredClone(PLAN); change(copy); return copy; };
  const cases = {
    'no data at all': undefined,
    'not an object': 'steps',
    'an unknown source': bad((d) => { d.source = 'elsewhere'; }),
    'a path plan with no path': bad((d) => { d.pathId = ''; }),
    'a date that is not a day': bad((d) => { d.targetDate = '2030-02-31'; }),
    'a date in the wrong shape': bad((d) => { d.targetDate = '31/01/2030'; }),
    'steps that are not a list': bad((d) => { d.steps = {}; }),
    'a line with no title': bad((d) => { d.steps[0].items[1].title = '   '; }),
    'a line with an unusable id': bad((d) => { d.steps[0].items[1].id = 'has space'; }),
    'two lines with one id': bad((d) => { d.steps[0].items[1].id = 'i1'; }),
    'a lesson with no path': bad((d) => { delete d.steps[0].items[0].path; }),
    'a line that is neither a lesson nor a task': bad((d) => { d.steps[0].items[0].type = 'video'; }),
    'too many steps': bad((d) => { d.steps = Array.from({ length: LIMITS.planStepsMax + 1 }, () => ({ title: 's', items: [] })); }),
    'too many lines': bad((d) => { d.steps[0].items = Array.from({ length: LIMITS.planItemsMax + 1 }, (_, i) => ({ id: `t${i}`, type: 'task', title: 'x' })); })
  };
  for (const [name, data] of Object.entries(cases)) {
    const res = await call(ada, 'POST', '/workspace/pages', { kind: 'plan', title: 'Bad', data });
    assert.equal(res.status, 400, name);
    assert.ok(typeof (await json(res)).error === 'string', `${name}: says why`);
  }
  assert.equal(count('workspace_pages'), 0, 'nothing was left behind');

  const plan = await create(ada, { kind: 'plan', title: 'Good', data: PLAN });
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${plan.id}`, { data: { source: 'own', steps: 'x' } })).status, 400);
  assert.deepEqual((await json(await call(ada, 'GET', `/workspace/pages/${plan.id}`))).data, PLAN, 'a refused change leaves the plan as it was');
});

test('a person\'s own list is a plan with no path, and a plan may have no target date', async () => {
  const own = { source: 'own', targetDate: null, steps: [{ title: 'My list', items: [{ id: 'a', type: 'task', title: 'Read the docs' }] }] };
  const plan = await create(ada, { kind: 'plan', title: 'Mine', data: own });
  assert.deepEqual(plan.data, { source: 'own', pathId: null, targetDate: null, steps: [{ title: 'My list', items: [{ id: 'a', type: 'task', title: 'Read the docs', done: false }] }] });
});

test('a saved diagram keeps its source, starts empty, and is limited in size', async () => {
  const diagram = await create(ada, { kind: 'diagram', title: 'Login flow' });
  assert.deepEqual(diagram.data, { source: '' });
  const source = 'flowchart LR\n  A --> B';
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${diagram.id}`, { data: { source } })).status, 200);
  assert.equal((await json(await call(ada, 'GET', `/workspace/pages/${diagram.id}`))).data.source, source);

  assert.equal((await call(ada, 'PUT', `/workspace/pages/${diagram.id}`, { data: { source: 'x'.repeat(LIMITS.diagramSourceMax + 1) } })).status, 400);
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${diagram.id}`, { data: { source: 5 } })).status, 400);
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${diagram.id}`, { content: { type: 'doc' } })).status, 400, 'a diagram has no text document');
  assert.equal((await json(await call(ada, 'GET', `/workspace/pages/${diagram.id}`))).data.source, source, 'unchanged');
});

test('a kind that keeps no data or no text refuses them, and an unknown kind is refused', async () => {
  const folder = await create(ada, { kind: 'folder', title: 'F' });
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${folder.id}`, { data: { source: '' } })).status, 400);
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${folder.id}`, { content: { type: 'doc' } })).status, 400);
  const page = await create(ada, { title: 'P' });
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${page.id}`, { data: { source: '' } })).status, 400);
  assert.equal((await call(ada, 'POST', '/workspace/pages', { kind: 'spreadsheet' })).status, 400);
  assert.equal((await call(ada, 'POST', '/workspace/pages', { kind: 'folder', parentId: 'nope' })).status, 404);
});

test('a title is trimmed and limited, and a page\'s text is limited in size', async () => {
  const page = await create(ada, { title: `  ${'t'.repeat(LIMITS.titleMax + 50)}  ` });
  assert.equal(page.title.length, LIMITS.titleMax);
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${page.id}`, { content: { type: 'doc', content: 'x'.repeat(LIMITS.contentBytesMax) } })).status, 400);
});

test('a person can keep only so many pages', async () => {
  const now = new Date().toISOString();
  const insert = env.DB.raw.prepare('INSERT INTO workspace_pages (id, user_id, title, sort_order, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < LIMITS.pagesMax; i++) insert.run(`p${i}`, 'user-ada@example.com', 'x', i, '', now, now);
  assert.equal((await call(ada, 'POST', '/workspace/pages', { title: 'One too many' })).status, 400);
  assert.equal((await call(grace, 'POST', '/workspace/pages', { title: 'Her own' })).status, 201, 'the limit is per person');
});

test('deleting a plan, a diagram or a list removes what it kept; deleting an account removes everything of the hub and nothing of anyone else\'s', async () => {
  const plan = await create(ada, { kind: 'plan', title: 'Plan', data: PLAN });
  await create(ada, { kind: 'diagram', title: 'Diagram' });
  const list = await create(ada, { kind: 'revision', title: 'Revise' });
  assert.equal((await call(ada, 'POST', `/workspace/pages/${list.id}/revision`, { path: 'a/README.md', title: 'A' })).status, 201);
  const hers = await create(grace, { kind: 'revision', title: 'Hers' });
  await call(grace, 'POST', `/workspace/pages/${hers.id}/revision`, { path: 'b/README.md', title: 'B' });

  assert.equal((await call(ada, 'DELETE', `/workspace/pages/${plan.id}`)).status, 200);
  assert.equal(count('workspace_meta', 'page_id = ?', plan.id), 0);

  assert.equal((await call(ada, 'DELETE', `/workspace/pages/${list.id}`)).status, 200);
  assert.equal(count('revision_items', 'user_id = ?', 'user-ada@example.com'), 0, 'the lessons on a deleted list go with it');

  await call(ada, 'POST', `/workspace/pages/${(await create(ada, { kind: 'revision', title: 'Again' })).id}/revision`, { path: 'c/README.md', title: 'C' });
  assert.equal((await call(ada, 'DELETE', '/account')).status, 204);
  for (const table of ['workspace_pages', 'workspace_meta', 'revision_items']) {
    assert.equal(count(table, 'user_id = ?', 'user-ada@example.com'), 0, `${table}: her rows are gone`);
  }
  assert.equal(count('workspace_pages', 'user_id = ?', 'user-grace@example.com'), 1);
  assert.equal(count('workspace_meta', 'user_id = ?', 'user-grace@example.com'), 1);
  assert.equal(count('revision_items', 'user_id = ?', 'user-grace@example.com'), 1);
});

// ------------------------------------------------------------------------------------------------ a drawn diagram
const DRAWING = {
  nodes: [
    { id: 'n1', label: 'Client', shape: 'circle', x: 40, y: 40 },
    { id: 'n2', label: 'Is it valid?', shape: 'decision', x: 240, y: 40 },
    { id: 'n3', label: 'Users "DB"', shape: 'database', x: 480, y: 40 }
  ],
  edges: [
    { id: 'e1', from: 'n1', to: 'n2', label: '', dashed: false },
    { id: 'e2', from: 'n2', to: 'n3', label: 'yes', dashed: true }
  ]
};
const DRAWN_SOURCE = 'flowchart LR\n  n1(("Client"))\n  n2{"Is it valid?"}\n  n3[("Users #quot;DB#quot;")]\n  n1 --> n2\n  n2 -.->|"yes"| n3';

test('a drawn diagram keeps its boxes and arrows, and the Mermaid source is written by the server from them', async () => {
  const diagram = await create(ada, { kind: 'diagram', title: 'Login flow' });
  const res = await call(ada, 'PUT', `/workspace/pages/${diagram.id}`, { data: { mode: 'visual', model: DRAWING, source: 'flowchart LR\n  not --> this' } });
  assert.equal(res.status, 200);
  const stored = (await json(await call(ada, 'GET', `/workspace/pages/${diagram.id}`))).data;
  assert.deepEqual(stored, { source: DRAWN_SOURCE, mode: 'visual', model: DRAWING });
  assert.deepEqual(JSON.parse(raw('SELECT data FROM workspace_meta WHERE page_id = ?', diagram.id)[0].data), stored);

  // a drawing can be the first data a diagram gets
  const born = await create(ada, { kind: 'diagram', title: 'Made drawn', data: { mode: 'visual', model: DRAWING } });
  assert.equal(born.data.source, DRAWN_SOURCE);
  assert.deepEqual(born.data.model, DRAWING);
});

test('a diagram goes back to text, and from then on is the person\'s own text again', async () => {
  const diagram = await create(ada, { kind: 'diagram', title: 'Back to text', data: { mode: 'visual', model: DRAWING } });
  const text = 'flowchart LR\n  A --> B';
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${diagram.id}`, { data: { source: text } })).status, 200);
  assert.deepEqual((await json(await call(ada, 'GET', `/workspace/pages/${diagram.id}`))).data, { source: text }, 'no drawing, no mode');
});

test('a drawing that is malformed, unknown or too large is refused and the page is not changed', async () => {
  const diagram = await create(ada, { kind: 'diagram', title: 'Careful', data: { mode: 'visual', model: DRAWING } });
  const bad = [
    { mode: 'visual' },
    { mode: 'visual', model: 'drawing' },
    { mode: 'visual', model: { nodes: [{ id: 'n1', label: 'A', shape: 'star', x: 0, y: 0 }], edges: [] } },
    { mode: 'visual', model: { nodes: [{ id: 'n1', label: 'A', shape: 'rect', x: 'left', y: 0 }], edges: [] } },
    { mode: 'visual', model: { nodes: [{ id: 'n1', label: 'A', shape: 'rect', x: LIMITS.diagramCoordMax + 1, y: 0 }], edges: [] } },
    { mode: 'visual', model: { nodes: [{ id: 'n1', label: 'A', shape: 'rect', x: 0, y: 0 }], edges: [{ id: 'e1', from: 'n1', to: 'ghost' }] } },
    { mode: 'visual', model: { nodes: Array.from({ length: LIMITS.diagramNodesMax + 1 }, (_, i) => ({ id: `n${i}`, label: 'A', shape: 'rect', x: 0, y: 0 })), edges: [] } },
    { mode: 'visual', model: { nodes: Array.from({ length: LIMITS.diagramNodesMax }, (_, i) => ({ id: `n${i}`, label: '"'.repeat(LIMITS.diagramNodeLabelMax), shape: 'rect', x: 0, y: 0 })), edges: [] } },
    { mode: 'sketch', source: 'x' }
  ];
  for (const data of bad) assert.equal((await call(ada, 'PUT', `/workspace/pages/${diagram.id}`, { data })).status, 400, JSON.stringify(data).slice(0, 80));
  assert.equal((await call(ada, 'POST', '/workspace/pages', { kind: 'diagram', title: 'New', data: bad[2] })).status, 400, 'a new page is checked the same way');
  assert.deepEqual((await json(await call(ada, 'GET', `/workspace/pages/${diagram.id}`))).data.model, DRAWING, 'unchanged');
});

test('what is kept of a drawing is only what is allowed: unknown keys are dropped and words are cleaned', async () => {
  const diagram = await create(ada, { kind: 'diagram', title: 'Cleaned' });
  const model = { admin: true, nodes: [{ id: 'n1', label: 'A\u0007B', shape: 'rect', x: 1.4, y: 2.6, onclick: 'alert(1)' }], edges: [] };
  await call(ada, 'PUT', `/workspace/pages/${diagram.id}`, { data: { mode: 'visual', model } });
  const stored = (await json(await call(ada, 'GET', `/workspace/pages/${diagram.id}`))).data;
  assert.deepEqual(stored.model, { nodes: [{ id: 'n1', label: 'AB', shape: 'rect', x: 1, y: 3 }], edges: [] });
  assert.equal(stored.source, 'flowchart LR\n  n1["AB"]');
});

test('another person cannot read or change a drawing; it is not found, and nothing changes', async () => {
  const diagram = await create(ada, { kind: 'diagram', title: 'Private drawing', data: { mode: 'visual', model: DRAWING } });
  assert.equal((await call(grace, 'GET', `/workspace/pages/${diagram.id}`)).status, 404);
  assert.equal((await call(grace, 'PUT', `/workspace/pages/${diagram.id}`, { data: { source: 'x' } })).status, 404);
  assert.equal((await call(null, 'PUT', `/workspace/pages/${diagram.id}`, { data: { source: 'x' } })).status, 401);
  assert.deepEqual((await json(await call(ada, 'GET', `/workspace/pages/${diagram.id}`))).data.model, DRAWING);
});

// ------------------------------------------------------------------------------------------------ a page dropped in the tree
// A drag in the tree saves through the same PUT as "Move to…", with the parent and the order that webapp/src/lib/workspace/tree.js
// works out. The server needs nothing new for it: these tests put the two together.
const shown = async (cookie) => (await json(await call(cookie, 'GET', '/workspace/pages'))).map((p) => ({ ...p }));
const order = (pages, parentId) => childrenOf(pages, parentId).map((p) => p.title);
async function dropOn(cookie, id, targetId, position, expanded) {
  const pages = await shown(cookie);
  const plan = planDrop(pages, id, targetId, position, expanded);
  assert.equal(plan.ok, true, plan.reason);
  for (const other of plan.renumber || []) assert.equal((await call(cookie, 'PUT', `/workspace/pages/${other.id}`, { order: other.order })).status, 200);
  const res = await call(cookie, 'PUT', `/workspace/pages/${id}`, { parentId: plan.parentId, order: plan.order });
  assert.equal(res.status, 200);
  return plan;
}

test('a page dropped between two others, onto a folder, or on the top level keeps the place it was given after a reload', async () => {
  const folder = await create(ada, { kind: 'folder', title: 'Folder' });
  const a = await create(ada, { title: 'A', parentId: folder.id });
  const b = await create(ada, { title: 'B', parentId: folder.id });
  const c = await create(ada, { title: 'C' });
  const d = await create(ada, { title: 'D' });

  await dropOn(ada, c.id, b.id, 'before'); // between A and B, in the folder
  assert.deepEqual(order(await shown(ada), folder.id), ['A', 'C', 'B']);
  await dropOn(ada, d.id, folder.id, 'inside'); // last in the folder
  assert.deepEqual(order(await shown(ada), folder.id), ['A', 'C', 'B', 'D']);
  await dropOn(ada, a.id, null, 'inside'); // out to the top level, last
  assert.deepEqual(order(await shown(ada), null), ['Folder', 'A']);
  await dropOn(ada, a.id, folder.id, 'before'); // before the folder
  assert.deepEqual(order(await shown(ada), null), ['A', 'Folder']);
  assert.equal(raw('SELECT parent_id FROM workspace_pages WHERE id = ?', a.id)[0].parent_id, null);
});

test('dropping again and again in the same gap runs out of room, and the siblings are numbered afresh and keep their order', async () => {
  const first = await create(ada, { title: 'First' });
  await create(ada, { title: 'Last' });
  const movers = [];
  for (let i = 0; i < 26; i++) movers.push(await create(ada, { title: `M${i}` }));
  // each page is dropped just after First, so the gap between First and what follows it is halved every time
  let renumbered = false;
  for (const mover of movers) {
    const plan = await dropOn(ada, mover.id, first.id, 'after');
    renumbered = renumbered || !!plan.renumber;
  }
  assert.equal(renumbered, true, 'the numbers ran out and were given out again');
  const pages = await shown(ada);
  assert.deepEqual(order(pages, null), ['First', ...movers.map((m) => m.title).reverse(), 'Last']);
  const orders = pages.map((p) => p.order);
  assert.equal(new Set(orders).size, orders.length, 'no two pages share a place');
});

test('a folder dropped into itself or into what is inside it is refused by the rules and by the server', async () => {
  const outer = await create(ada, { kind: 'folder', title: 'Outer' });
  const inner = await create(ada, { kind: 'folder', title: 'Inner', parentId: outer.id });
  const pages = await shown(ada);
  assert.equal(planDrop(pages, outer.id, inner.id, 'inside').reason, DROP_REFUSAL.ownDescendant);
  assert.equal(planDrop(pages, outer.id, outer.id, 'inside').reason, DROP_REFUSAL.itself);
  assert.equal((await call(ada, 'PUT', `/workspace/pages/${outer.id}`, { parentId: inner.id, order: 0 })).status, 400, 'a client that ignores the rules is stopped');
  assert.equal(raw('SELECT parent_id FROM workspace_pages WHERE id = ?', outer.id)[0].parent_id, null);
});

test('a drop onto someone else\'s folder, or of someone else\'s page, is not found and changes nothing', async () => {
  const mine = await create(ada, { kind: 'folder', title: 'Mine' });
  const hers = await create(grace, { title: 'Hers' });
  assert.equal((await call(grace, 'PUT', `/workspace/pages/${hers.id}`, { parentId: mine.id, order: 0 })).status, 404);
  assert.equal((await call(grace, 'PUT', `/workspace/pages/${mine.id}`, { parentId: null, order: 9 })).status, 404);
  assert.equal((await call(null, 'PUT', `/workspace/pages/${mine.id}`, { parentId: null, order: 9 })).status, 401);
  assert.equal(raw('SELECT parent_id, sort_order FROM workspace_pages WHERE id = ?', hers.id)[0].parent_id, null);
  assert.equal(raw('SELECT sort_order FROM workspace_pages WHERE id = ?', mine.id)[0].sort_order, 0);
});
