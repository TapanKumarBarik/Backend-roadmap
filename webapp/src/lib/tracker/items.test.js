import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKER } from '../../config/tracker.js';
import { rowId, lessonUrls, resolveItems, validateItems } from './items.js';

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

test('the real items.json passes its own checks', async () => {
  const { default: fs } = await import('node:fs');
  const items2 = JSON.parse(fs.readFileSync(new URL('../../../../content/tracker/items.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateItems(items2, ALLOWED), []);
  assert.equal(items2.sd.rows.length + items2.gai.rows.length + items2.qa.rows.length + items2.pr.rows.length, 748 + 534 + 214 + 37);
});
