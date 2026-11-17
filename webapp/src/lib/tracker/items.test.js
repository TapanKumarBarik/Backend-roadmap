import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKER } from '../../config/tracker.js';
import { rowId, lessonPathsFor, lessonTitle, lessonUrls, resolveItems, stepOf, validateItems, validateLessonLinks } from './items.js';

const ALLOWED = { priorities: TRACKER.priorities, difficulties: TRACKER.difficulties };
const urlOf = (module) => (module.startsWith('x/') ? `/${module}/` : null);

const items = () => ({
  sd: { phases: ['Phase 1: Core'], rows: [{ i: 'SD-A-001', ph: 0, n: 'What System Design Is', p: 'Must Know', df: 'Beginner' }, { i: 'SD-A-002', ph: 0, n: 'Client-Server', p: 'High', df: 'Beginner' }] },
  gai: { phases: ['G1: Foundations'], tracks: ['A', 'B'], rows: [{ i: 'GAI-GF-001', ph: 0, n: 'Async FastAPI', p: 'Must Know', df: 'Intermediate', tr: 'A' }] },
  qa: { rows: [{ i: 'GAI-GF-001', n: 'Why does a sync call hurt?', df: 'Intermediate' }] },
  pr: { steps: ['Requirements', 'API Design'], rows: [{ n: 'URL Shortener', df: 'Beginner', p: 'Must Know' }, { n: 'Rate Limiter', df: 'Intermediate', p: 'Must Know' }] }
});

test('a row is saved under an id that never changes: a checklist item keeps its own, a question is Q- and its study item, a design problem is PR- and its place', () => {
  assert.equal(rowId('sd', { i: 'SD-A-001' }, 0), 'SD-A-001');
  assert.equal(rowId('gai', { i: 'GAI-GF-001' }, 5), 'GAI-GF-001');
  assert.equal(rowId('qa', { i: 'GAI-GF-001' }, 0), 'Q-GAI-GF-001', 'a question and the study item it asks about must not share a key');
  assert.equal(rowId('pr', { n: 'URL Shortener' }, 0), 'PR-01');
  assert.equal(rowId('pr', { n: 'x' }, 36), 'PR-37');
});

test('the lesson of an item is the module of its video, an item made twice keeps the earlier one, and a video with no module links nowhere', () => {
  const registry = {
    videos: [
      { lesson: 'SD-A-001', module: 'x/one', published: '2026-11-04T08:30:00Z' },
      { lesson: 'SD-N-001', module: 'x/late', published: '2026-12-20T08:30:00Z' },
      { lesson: 'P5-SD-N-001', module: 'x/early', published: '2026-11-09T08:30:00Z' },
      { lesson: 'SD-B-001' },
      { module: 'x/no-lesson-id' },
      { lesson: 'SD-C-001', module: 'y/not-a-page' }
    ]
  };
  const lessons = lessonUrls(registry, urlOf);
  assert.equal(lessons.get('SD-A-001'), '/x/one/');
  assert.equal(lessons.get('SD-N-001'), '/x/early/', 'the P5- copy is the same item, and the earlier video wins');
  assert.equal(lessons.has('P5-SD-N-001'), false);
  assert.equal(lessons.has('SD-B-001'), false);
  assert.equal(lessons.has('SD-C-001'), false, 'a module with no page address is left out');
  assert.equal(lessons.size, 2);
});

test('the items are made ready for the page: every row has its id, and a row whose study item has a lesson has its address', () => {
  const lessons = new Map([['SD-A-001', '/x/one/'], ['GAI-GF-001', '/x/two/']]);
  const out = resolveItems(items(), lessons);
  assert.deepEqual(out.sd.rows[0], { id: 'SD-A-001', i: 'SD-A-001', ph: 0, n: 'What System Design Is', p: 'Must Know', df: 'Beginner', u: '/x/one/' });
  assert.equal(out.sd.rows[1].u, undefined, 'no lesson, no address');
  assert.equal(out.qa.rows[0].id, 'Q-GAI-GF-001');
  assert.equal(out.qa.rows[0].u, '/x/two/', 'a question links to the lesson of the study item it asks about');
  assert.equal(out.pr.rows[1].id, 'PR-02');
  assert.deepEqual(out.sd.phases, ['Phase 1: Core'], 'what is not a row is kept');
  assert.deepEqual(out.pr.steps, ['Requirements', 'API Design']);
  assert.deepEqual(out.gai.tracks, ['A', 'B']);
  assert.equal(items().sd.rows[0].id, undefined, 'the input is not changed');
});

test('items.json is checked before it is shipped: a missing title, an id used twice, a phase or a priority the page has no word for', () => {
  assert.deepEqual(validateItems(items(), ALLOWED), []);
  const bad = items();
  bad.sd.rows[1].i = 'SD-A-001';
  assert.match(validateItems(bad, ALLOWED).join('\n'), /the id is used twice/);
  const untitled = items();
  untitled.sd.rows[0].n = '  ';
  assert.match(validateItems(untitled, ALLOWED).join('\n'), /no title/);
  const phase = items();
  phase.sd.rows[0].ph = 4;
  assert.match(validateItems(phase, ALLOWED).join('\n'), /phase 4 is not one of the 1 listed/);
  const priority = items();
  priority.sd.rows[0].p = 'Urgent';
  assert.match(validateItems(priority, ALLOWED).join('\n'), /priority "Urgent"/);
  const difficulty = items();
  difficulty.pr.rows[0].df = 'Hard';
  assert.match(validateItems(difficulty, ALLOWED).join('\n'), /difficulty "Hard"/);
  const track = items();
  track.gai.rows[0].tr = 'Z';
  assert.match(validateItems(track, ALLOWED).join('\n'), /track "Z"/);
  const empty = items();
  empty.qa.rows = [];
  assert.match(validateItems(empty, ALLOWED).join('\n'), /qa: no rows/);
  const steps = items();
  steps.pr.steps = [];
  assert.match(validateItems(steps, ALLOWED).join('\n'), /no steps listed/);
});

const withResources = () => ({
  ...items(),
  resources: [{ n: 'System Design Primer', u: 'https://github.com/donnemartin/system-design-primer', t: 'Open-source guide' }, { n: 'Hello Interview', u: 'https://www.hellointerview.com/learn/system-design' }],
  resourceSets: [[0, 1], [1]]
});

test('a question takes the resources of the study item it asks about, and a design problem those of the first checklist item it covers', () => {
  const data = withResources();
  data.sd.rows[0].rs = 0;
  data.gai.rows[0].rs = 1;
  data.pr.rows[0].ids = 'SD-A-001 to SD-A-009';
  data.pr.rows[1].ids = 'SD-Z-001 to SD-Z-009';
  const out = resolveItems(data, new Map());
  assert.equal(out.sd.rows[0].rs, 0);
  assert.equal(out.sd.rows[1].rs, undefined, 'an item with no list has none');
  assert.equal(out.qa.rows[0].rs, 1, 'the question asks about GAI-GF-001, which uses set 1');
  assert.equal(out.pr.rows[0].rs, 0, 'the first checklist item it covers is SD-A-001');
  assert.equal(out.pr.rows[1].rs, undefined, 'a problem that covers no item with a list has none');
  assert.deepEqual(out.resources, data.resources, 'the links are carried to the page');
  assert.deepEqual(out.resourceSets, data.resourceSets);
  assert.equal(resolveItems(items(), new Map()).resources, undefined, 'a file with no resources has none');
});

test('the learning resources are checked before they are shipped: a link that is not https, a name used twice, a set that points at nothing, a row with no such set', () => {
  assert.deepEqual(validateItems(withResources(), ALLOWED), []);
  const http = withResources();
  http.resources[0].u = 'http://example.com/book';
  assert.match(validateItems(http, ALLOWED).join('\n'), /the link is not an https address/);
  const script = withResources();
  script.resources[1].u = 'javascript:alert(1)';
  assert.match(validateItems(script, ALLOWED).join('\n'), /the link is not an https address/, 'a link can never be a script');
  const twice = withResources();
  twice.resources[1].n = 'System Design Primer';
  assert.match(validateItems(twice, ALLOWED).join('\n'), /the name is used twice/);
  const nothing = withResources();
  nothing.resourceSets[0] = [0, 7];
  assert.match(validateItems(nothing, ALLOWED).join('\n'), /7 is not a resource/);
  const empty = withResources();
  empty.resourceSets[1] = [];
  assert.match(validateItems(empty, ALLOWED).join('\n'), /resource set 1: empty/);
  const missing = withResources();
  missing.sd.rows[0].rs = 5;
  assert.match(validateItems(missing, ALLOWED).join('\n'), /resource set 5 does not exist/);
});

test('the real items.json passes its own checks', async () => {
  const { default: fs } = await import('node:fs');
  const items2 = JSON.parse(fs.readFileSync(new URL('../../../../content/tracker/items.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateItems(items2, ALLOWED), []);
  assert.equal(items2.sd.rows.length + items2.gai.rows.length + items2.qa.rows.length + items2.pr.rows.length, 748 + 534 + 214 + 37);
});

// ---- the lessons of the site that cover a row
const LIMITS = { problem: 2, step: 2, problemSheet: 3 };
const links = () => ({
  items: { 'SD-A-001': ['sd/one', 'sd/two'], 'GAI-GF-001': ['genai/async'] },
  steps: { sd: { Requirements: ['sd/req-a', 'sd/req-b', 'sd/req-c'] }, gai: { Requirements: ['sd/req-a'] } },
  problems: { Pastebin: ['sd/pastebin', 'sd/object-storage', 'sd/third'], 'URL Shortener': ['sd/url'] }
});
const info = () => new Map([
  ['sd/one', { u: '/sd/one/', t: 'One', c: 'sd' }], ['sd/two', { u: '/sd/two/', t: 'Two', c: 'sd' }], ['genai/async', { u: '/genai/async/', t: 'Async', c: 'genai' }],
  ['sd/req-a', { u: '/sd/req-a/', t: 'Requirements A', c: 'sd' }], ['sd/req-b', { u: '/sd/req-b/', t: 'Requirements B', c: 'sd' }], ['sd/req-c', { u: '/sd/req-c/', t: 'Requirements C', c: 'sd' }],
  ['sd/pastebin', { u: '/sd/pastebin/', t: 'Pastebin', c: 'sd' }], ['sd/object-storage', { u: '/sd/object-storage/', t: 'Object storage', c: 'sd' }], ['sd/third', { u: '/sd/third/', t: 'Third', c: 'sd' }],
  ['sd/url', { u: '/sd/url/', t: 'URL', c: 'sd' }]
]);

test('a lesson is titled the way a person says it, without the number in front', () => {
  assert.equal(lessonTitle('Module 07: HTTP/1.1 vs HTTP/2 vs HTTP/3'), 'HTTP/1.1 vs HTTP/2 vs HTTP/3');
  assert.equal(lessonTitle('Lesson 03: Functional Requirements'), 'Functional Requirements');
  assert.equal(lessonTitle('Track 4: Networking Fundamentals'), 'Networking Fundamentals');
  assert.equal(lessonTitle('07 - Resilience Patterns'), 'Resilience Patterns');
  assert.equal(lessonTitle('Capstone Project'), 'Capstone Project');
  assert.equal(lessonTitle(undefined), '');
});

test('a row is one step of a design problem when its title is the problem, a colon and the step', () => {
  assert.equal(stepOf({ st: 'Pastebin', n: 'Pastebin: Requirements' }), 'Requirements');
  assert.equal(stepOf({ st: 'Enterprise RAG', n: 'Enterprise RAG: Requirements and Constraints' }), 'Requirements and Constraints');
  assert.equal(stepOf({ st: 'Foundations', n: 'What System Design Is' }), null);
  assert.equal(stepOf({ n: 'No subtopic' }), null);
});

test('the lessons of a row: an item has the ones found for it, a step has some for the problem and some for the step, a practice problem has its own, and an item with none has none', () => {
  assert.deepEqual(lessonPathsFor('sd', { i: 'SD-A-001', n: 'What System Design Is' }, links(), LIMITS), ['sd/one', 'sd/two']);
  assert.deepEqual(lessonPathsFor('sd', { i: 'SD-A-002', n: 'Client-Server' }, links(), LIMITS), []);
  assert.deepEqual(lessonPathsFor('sd', { i: 'SD-U-019', st: 'Pastebin', n: 'Pastebin: Requirements' }, links(), LIMITS), ['sd/pastebin', 'sd/object-storage', 'sd/req-a', 'sd/req-b'], 'two for the problem, then two for the step');
  assert.deepEqual(lessonPathsFor('gai', { i: 'GAI-CS-001', st: 'Pastebin', n: 'Pastebin: Requirements' }, links(), LIMITS), ['sd/pastebin', 'sd/object-storage', 'sd/req-a'], 'a step is looked up on its own sheet');
  assert.deepEqual(lessonPathsFor('sd', { i: 'SD-U-020', st: 'Nothing', n: 'Nothing: Requirements' }, links(), LIMITS), ['sd/req-a', 'sd/req-b'], 'a problem with no lessons still has its step');
  assert.deepEqual(lessonPathsFor('pr', { n: 'Pastebin' }, links(), LIMITS), ['sd/pastebin', 'sd/object-storage', 'sd/third']);
  assert.deepEqual(lessonPathsFor('pr', { n: 'Rate Limiter' }, links(), LIMITS), []);
  assert.deepEqual(lessonPathsFor('sd', { i: 'SD-A-001', n: 'x' }, undefined, LIMITS), []);
});

test('with the lessons of the site, a row lists its own by position in one catalogue, the lesson with a video first, and a question has those of its study item', () => {
  const data = items();
  data.sd.rows.push({ i: 'SD-U-019', ph: 0, n: 'Pastebin: Requirements', st: 'Pastebin', p: 'High', df: 'Beginner' });
  const out = resolveItems(data, new Map([['SD-A-001', '/sd/two/']]), { lessonLinks: links(), info: info(), limits: LIMITS });
  const row = (sheet, id) => out[sheet].rows.find((r) => r.id === id);
  const titles = (r) => r.ls.map((i) => out.lessons[i].t);
  assert.deepEqual(titles(row('sd', 'SD-A-001')), ['Two', 'One'], 'the lesson that has the video comes first and is not listed twice');
  assert.equal(row('sd', 'SD-A-002').ls, undefined, 'an item with no lesson has no list');
  assert.deepEqual(titles(row('sd', 'SD-U-019')), ['Pastebin', 'Object storage', 'Requirements A', 'Requirements B']);
  assert.deepEqual(titles(row('qa', 'Q-GAI-GF-001')), ['Async'], 'a question takes the lessons of the study item it asks about');
  assert.equal(new Set(out.lessons.map((l) => l.u)).size, out.lessons.length, 'a lesson is in the catalogue once, however many rows list it');
  assert.ok(out.lessons.every((l) => l.u && l.t && l.c));
  const plain = resolveItems(items(), new Map());
  assert.equal(plain.lessons, undefined, 'without the lessons of the site nothing about them is carried');
});

test('the lesson links are checked before they ship: a lesson that is not written, an item or a problem that is not there, a step with no lesson', () => {
  const data = items();
  data.sd.rows.push({ i: 'SD-U-019', ph: 0, n: 'Pastebin: Requirements', st: 'Pastebin', p: 'High', df: 'Beginner' });
  data.gai.rows.push({ i: 'GAI-CS-001', ph: 0, n: 'Pastebin: Requirements', st: 'Pastebin', p: 'High', df: 'Beginner', tr: 'A' });
  const written = new Set(info().keys());
  assert.deepEqual(validateLessonLinks(links(), written, data), []);
  const bad = links();
  bad.items['SD-A-001'].push('sd/planned-one');
  bad.items['SD-Z-999'] = ['sd/one'];
  bad.problems['Made Up'] = ['sd/one'];
  bad.steps.sd['Not A Step'] = ['sd/one'];
  const text = validateLessonLinks(bad, written, data).join('\n');
  assert.match(text, /"sd\/planned-one" is not a written lesson/);
  assert.match(text, /SD-Z-999 is not a study item/);
  assert.match(text, /"Made Up" is not a design problem/);
  assert.match(text, /"Not A Step" is not a step of any problem/);
  const noStep = links();
  noStep.steps.sd.Requirements = [];
  assert.match(validateLessonLinks(noStep, written, data).join('\n'), /steps sd: "Requirements" has no lesson/);
});

test('the real lessons.json passes its own checks against the lessons that are written', async () => {
  const { default: fs } = await import('node:fs');
  const base = '../../../../';
  const real = JSON.parse(fs.readFileSync(new URL(`${base}content/tracker/lessons.json`, import.meta.url), 'utf8'));
  const itemsFile = JSON.parse(fs.readFileSync(new URL(`${base}content/tracker/items.json`, import.meta.url), 'utf8'));
  const indexUrl = new URL(`${base}dist/docs-index.json`, import.meta.url);
  if (!fs.existsSync(indexUrl)) return; // the docs index is written by `npm run index`; the build checks the same thing
  const tree = JSON.parse(fs.readFileSync(indexUrl, 'utf8')).tree;
  const written = new Set();
  (function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.file && !node.planned && /README\.md$/.test(node.file)) written.add(node.path);
    for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value);
  })(tree);
  assert.deepEqual(validateLessonLinks(real, written, itemsFile), []);
  assert.ok(Object.keys(real.problems).length >= 50 && Object.keys(real.items).length >= 300, 'the lessons for the design problems and for the study items are there');
});
