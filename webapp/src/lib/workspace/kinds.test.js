import test from 'node:test';
import assert from 'node:assert/strict';
import { KIND, KINDS, LIMITS, cleanData, cleanDiagramData, cleanItemTitle, isCalendarDate, isKind, isLessonPath, kindOf } from './kinds.js';

test('there are five kinds, and a page with no kind is a plain page', () => {
  assert.deepEqual([...KINDS].sort(), ['diagram', 'folder', 'page', 'plan', 'revision']);
  assert.equal(kindOf({ id: 'old' }), KIND.page);
  assert.equal(kindOf({ kind: 'folder' }), KIND.folder);
  assert.equal(kindOf({ kind: 'spreadsheet' }), KIND.page);
  assert.equal(kindOf(null), KIND.page);
  assert.equal(isKind('plan'), true);
  assert.equal(isKind('Plan'), false);
  assert.equal(isKind(5), false);
});

test('a date is a real day, written year-month-day', () => {
  for (const ok of ['2030-01-31', '2028-02-29']) assert.equal(isCalendarDate(ok), true, ok);
  for (const bad of ['2030-02-30', '2029-02-29', '2030-13-01', '30-01-2030', '2030-1-1', '', null, 20300101]) assert.equal(isCalendarDate(bad), false, String(bad));
});

test('a lesson path is short plain text', () => {
  assert.equal(isLessonPath('backend/01/README.md'), true);
  for (const bad of ['', 'a\nb', 'x'.repeat(LIMITS.lessonPathMax + 1), null, 5]) assert.equal(isLessonPath(bad), false);
});

test('control characters are taken out of what is kept, and an empty title falls back', () => {
  assert.equal(cleanItemTitle('  Sessions\u0000 and cookies  '), 'Sessions and cookies');
  assert.equal(cleanItemTitle('   ', 'x/README.md'), 'x/README.md');
  assert.equal(cleanItemTitle('t'.repeat(500)).length, LIMITS.itemTitleMax);
});

test('a diagram keeps its text and line endings are made plain', () => {
  assert.deepEqual(cleanDiagramData({ source: 'a\r\nb\rc' }).data, { source: 'a\nb\nc' });
  assert.ok(cleanDiagramData({ source: 5 }).problem);
  assert.ok(cleanDiagramData(null).problem);
  assert.ok(cleanDiagramData({ source: 'x'.repeat(LIMITS.diagramSourceMax + 1) }).problem);
});

test('a kind with no data of its own keeps an empty object whatever is sent', () => {
  for (const kind of [KIND.page, KIND.folder, KIND.revision]) assert.deepEqual(cleanData(kind, { anything: 1 }).data, {});
});
