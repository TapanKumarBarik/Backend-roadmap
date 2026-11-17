import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKER as C } from '../../config/tracker.js';
import { isDay, addDays, blankRecord, recordOf, compact, stepsOf, scoreOf, kindOf, nextReview, isDue, matches, summarize, toCsv, sanitize, serialize, backupText, readRecords, parseRange, inRange } from './model.js';

const STEPS = 7;
const row = (over = {}) => ({ id: 'SD-A-001', i: 'SD-A-001', ph: 0, t: 'System Design Fundamentals', st: 'Foundations', n: 'What System Design Is', p: 'Must Know', df: 'Beginner', ...over });
const NONE = { q: '', ph: '', st: '', pri: '', df: '', tr: '', lesson: '', due: false, notes: false };

test('a day is a real calendar day, and the days after it are counted across months, years and the leap day', () => {
  assert.ok(isDay('2026-11-16'));
  assert.ok(isDay('2028-02-29'));
  assert.ok(!isDay('2026-02-30'), 'there is no 30 February');
  assert.ok(!isDay('2027-02-29'), 'and 2027 is not a leap year');
  assert.ok(!isDay('16-11-2026') && !isDay('2026-1-5') && !isDay('') && !isDay(undefined) && !isDay(20261116));
  assert.equal(addDays('2026-11-16', 7), '2026-11-23');
  assert.equal(addDays('2026-12-30', 5), '2027-01-04');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2027-02-28', 1), '2027-03-01');
  assert.equal(addDays('2026-03-01', 30), '2026-03-31');
});

test('a row nobody touched is blank, and a record holds only what differs from it', () => {
  assert.deepEqual(blankRecord('sd', C), { s: 'Not Started', c: 0, n: '', d: '' });
  assert.deepEqual(blankRecord('qa', C), { s: 'Not Reviewed', c: 0, n: '', d: '' });
  assert.deepEqual(blankRecord('pr', C), { p: '', c: 0, n: '', d: '' });
  assert.deepEqual(compact('sd', { s: 'Not Started', c: 0, n: '', d: '' }, C), {}, 'an untouched row stores nothing');
  assert.deepEqual(compact('sd', { s: 'Completed', c: 3, n: '', d: '2026-11-16' }, C), { s: 'Completed', c: 3, d: '2026-11-16' });
  assert.deepEqual(recordOf('sd', { s: 'In Progress' }, C), { s: 'In Progress', c: 0, n: '', d: '' }, 'the rest comes from the blank record');
});

test('what a status comes to: done, in progress, to revise or not started, and for a design problem what its steps say', () => {
  const kind = (tab, s) => kindOf(tab, { s }, C);
  assert.equal(kind('sd', 'Completed'), 'done');
  assert.equal(kind('sd', 'In Progress'), 'wip');
  assert.equal(kind('sd', 'Needs Revision'), 'revise');
  assert.equal(kind('sd', 'Not Started'), 'none');
  assert.equal(kind('qa', 'Reviewed'), 'done');
  assert.equal(kind('qa', 'Mastered'), 'done', 'mastered is more than reviewed, and as done');
  assert.equal(kind('qa', 'Needs Practice'), 'revise');
  assert.equal(kind('sd', 'a status nobody has'), 'none');
  assert.equal(kindOf('pr', { p: '' }, C, STEPS), 'none');
  assert.equal(kindOf('pr', { p: '2000000' }, C, STEPS), 'wip');
  assert.equal(kindOf('pr', { p: '0100000' }, C, STEPS), 'wip', 'a step partly done is started');
  assert.equal(kindOf('pr', { p: '2222222' }, C, STEPS), 'done');
  assert.equal(kindOf('pr', { p: '2222221' }, C, STEPS), 'wip', 'one step partly done is not complete');
});

test('a design problem has the steps it is given, padded with "not done", and scores a step done as 1 and partly done as a half', () => {
  assert.equal(stepsOf({ p: '21' }, STEPS), '2100000');
  assert.equal(stepsOf({}, STEPS), '0000000');
  assert.equal(stepsOf({ p: '222222222' }, STEPS), '2222222', 'more than there are steps are ignored');
  assert.equal(scoreOf({ p: '2100000' }, STEPS), 1.5);
  assert.equal(scoreOf({ p: '2222222' }, STEPS), 7);
  assert.equal(scoreOf({}, STEPS), 0);
});

test('the next review comes 1, 3, 7, 14 or 30 days after the day studied, by confidence, and not before there is a day and a confidence', () => {
  const next = (c) => nextReview({ c, d: '2026-11-16' }, C);
  assert.deepEqual([1, 2, 3, 4, 5].map(next), ['2026-11-17', '2026-11-19', '2026-11-23', '2026-11-30', '2026-12-16']);
  assert.equal(nextReview({ c: 0, d: '2026-11-16' }, C), '', 'no confidence, no schedule');
  assert.equal(nextReview({ c: 3, d: '' }, C), '', 'no day, no schedule');
  assert.equal(nextReview({ c: 3, d: 'yesterday' }, C), '', 'a day that is not a day is no day');
});

test('an item is due when it is called back, or when its day has come; an item never started is not due however old its day', () => {
  const due = (record, today = '2026-11-23') => isDue('sd', recordOf('sd', record, C), today, C);
  assert.ok(due({ s: 'Needs Revision' }), 'needs revision is due now, with no day at all');
  const studied = { s: 'Completed', c: 3, d: '2026-11-16' };
  assert.ok(!due(studied, '2026-11-22'), 'confidence 3 comes back after 7 days: not on the sixth');
  assert.ok(due(studied, '2026-11-23'), 'on the seventh');
  assert.ok(due(studied, '2027-01-01'), 'and after');
  assert.ok(!due({ s: 'Not Started', c: 3, d: '2026-01-01' }), 'not started is never due');
  assert.ok(!due({ s: 'Completed', c: 0, d: '2026-01-01' }), 'with no confidence there is no schedule');
  assert.ok(isDue('qa', recordOf('qa', { s: 'Needs Practice' }, C), '2026-11-16', C), 'a question to practise is due');
  assert.ok(isDue('pr', recordOf('pr', { p: '2000000', c: 1, d: '2026-11-01' }, C), '2026-11-16', C, STEPS));
  assert.ok(!isDue('pr', recordOf('pr', { p: '', c: 1, d: '2026-11-01' }, C), '2026-11-16', C, STEPS), 'a problem with no step done is not due');
});

test('a filter keeps the rows it should: phase, status, priority, difficulty, track, lesson, notes, due, and a search of the title, the id, the topic and the notes', () => {
  const r = row();
  const rec = (over) => recordOf('sd', over, C);
  const keep = (filters, record = rec({}), r2 = r, today = '2026-11-16') => matches('sd', r2, record, { ...NONE, ...filters }, today, C);
  assert.ok(keep({}));
  assert.ok(keep({ ph: '0' }) && !keep({ ph: '1' }));
  assert.ok(keep({ pri: 'Must Know' }) && !keep({ pri: 'High' }));
  assert.ok(keep({ df: 'Beginner' }) && !keep({ df: 'Advanced' }));
  assert.ok(keep({ tr: 'A' }, rec({}), row({ tr: 'A' })) && !keep({ tr: 'B' }, rec({}), row({ tr: 'A' })));
  assert.ok(!keep({ lesson: 'has' }) && keep({ lesson: 'none' }) && keep({ lesson: 'has' }, rec({}), row({ u: '/x/' })));
  assert.ok(keep({ lesson: 'has' }, rec({}), row({ ls: [3] })) && !keep({ lesson: 'none' }, rec({}), row({ ls: [3] })), 'a row that lists lessons of the site has a lesson even without a video');
  assert.ok(!keep({ lesson: 'has' }, rec({}), row({ ls: [] })), 'an empty list is no lesson');
  assert.ok(keep({ st: 'Not Started' }) && !keep({ st: 'Completed' }) && keep({ st: 'Completed' }, rec({ s: 'Completed' })));
  assert.ok(!keep({ notes: true }) && keep({ notes: true }, rec({ n: 'redo the Lua version' })));
  assert.ok(!keep({ due: true }) && keep({ due: true }, rec({ s: 'Needs Revision' })));
  assert.ok(keep({ q: 'what system' }) && keep({ q: 'SD-A-001' }) && keep({ q: 'foundations' }) && !keep({ q: 'kubernetes' }));
  assert.ok(keep({ q: 'lua' }, rec({ n: 'redo the Lua version' })), 'a search looks in what the reader wrote');
  assert.ok(keep({ q: '  WHAT  ' }), 'case and the spaces round it do not matter');
  // a design problem is filtered by what its steps come to
  const problem = { id: 'PR-01', n: 'URL Shortener', df: 'Beginner', p: 'Must Know', ids: 'SD-U-001 to SD-U-009' };
  assert.ok(matches('pr', problem, recordOf('pr', { p: '2000000' }, C), { ...NONE, st: 'wip' }, '2026-11-16', C, STEPS));
  assert.ok(!matches('pr', problem, recordOf('pr', { p: '2000000' }, C), { ...NONE, st: 'done' }, '2026-11-16', C, STEPS));
  assert.ok(matches('pr', problem, recordOf('pr', {}, C), { ...NONE, q: 'sd-u-005' }, '2026-11-16', C, STEPS) === false && matches('pr', problem, recordOf('pr', {}, C), { ...NONE, q: 'sd-u-001' }, '2026-11-16', C, STEPS), 'a problem is found by the checklist ids it covers');
});

test('the study items a design problem covers are a range of ids, and a filter by it keeps those items and no others', () => {
  assert.deepEqual(parseRange('SD-U-280 to SD-U-288'), { from: 'SD-U-280', to: 'SD-U-288' });
  assert.deepEqual(parseRange(' SD-U-001 '), { from: 'SD-U-001', to: 'SD-U-001' }, 'a single id is a range of one');
  assert.equal(parseRange(''), null);
  assert.equal(parseRange('see the checklist'), null);
  assert.equal(parseRange('SD-U-280 to'), null);
  const range = parseRange('SD-U-280 to SD-U-288');
  assert.ok(inRange('SD-U-280', range) && inRange('SD-U-284', range) && inRange('SD-U-288', range), 'both ends are in');
  assert.ok(!inRange('SD-U-279', range) && !inRange('SD-U-289', range), 'the next ones are not');
  assert.ok(!inRange('SD-T-284', range), 'the same numbers in another group are not');
  assert.ok(!inRange(undefined, range) && !inRange('', range));
  const keep = (id) => matches('sd', { id, i: id, n: 'x' }, recordOf('sd', {}, C), { ...NONE, range }, '2026-11-16', C);
  assert.ok(keep('SD-U-283') && !keep('SD-U-290') && !keep('SD-A-283'));
  assert.ok(matches('sd', { id: 'SD-U-290', i: 'SD-U-290', n: 'x' }, recordOf('sd', {}, C), { ...NONE, range: null }, '2026-11-16', C), 'no range, no restriction');
});

test('the counts of a sheet: rows by status, rows done, rows due, and each phase', () => {
  const rows = [row({ id: 'A', ph: 0 }), row({ id: 'B', ph: 0 }), row({ id: 'C', ph: 1 }), row({ id: 'D', ph: 1 })];
  const records = new Map([['A', { s: 'Completed', c: 3, d: '2026-11-01' }], ['B', { s: 'In Progress' }], ['C', { s: 'Needs Revision' }]]);
  const s = summarize('sd', rows, records, '2026-11-16', C);
  assert.equal(s.total, 4);
  assert.equal(s.done, 1);
  assert.equal(s.due, 2, 'A came due on 8 November and C is called back');
  assert.deepEqual(s.labels, { Completed: 1, 'In Progress': 1, 'Needs Revision': 1, 'Not Started': 1 });
  assert.deepEqual(s.phases, { 0: { total: 2, done: 1 }, 1: { total: 2, done: 0 } });
  const practice = summarize('pr', [{ id: 'PR-01' }, { id: 'PR-02' }, { id: 'PR-03' }], new Map([['PR-01', { p: '2222222' }], ['PR-02', { p: '0200000' }]]), '2026-11-16', C, STEPS);
  assert.deepEqual(practice.labels, { Complete: 1, 'Partly done': 1, 'Not started': 1 });
  assert.equal(practice.done, 1);
});

test('a sheet as CSV: a row for every item, quoted where it must be, a spreadsheet formula made harmless, and Windows line endings', () => {
  const rows = [row({ id: 'A', i: 'A', n: 'Cache, "write-through"' }), row({ id: 'B', i: 'B', n: '=HYPERLINK("http://evil")' })];
  const records = new Map([['A', { s: 'Completed', c: 3, d: '2026-11-16', n: 'line one\nline two' }]]);
  const csv = toCsv('sd', rows, records, C);
  assert.ok(csv.startsWith('﻿'), 'with a byte-order mark so that a spreadsheet reads it as UTF-8');
  const lines = csv.split('\r\n');
  assert.equal(lines[0], '﻿Id,Item,Status,Confidence,Last studied,Next review,Notes');
  assert.equal(lines[1], 'A,"Cache, ""write-through""",Completed,3,2026-11-16,2026-11-23,"line one\nline two"');
  assert.equal(lines[2], `B,"'=HYPERLINK(""http://evil"")",Not Started,,,,`, 'a title that starts with = is not read as a formula');
  assert.equal(lines[3], '\r\n'.slice(2), 'and the file ends with a line ending');
  const practice = toCsv('pr', [{ id: 'PR-01', n: 'URL Shortener' }], new Map([['PR-01', { p: '2100000' }]]), C, STEPS, ['Requirements', 'Capacity Estimation']);
  assert.match(practice.split('\r\n')[1], /Requirements: done; Capacity Estimation: partly done; 3: not done/);
});

const KNOWN = new Map([['SD-A-001', { tab: 'sd', steps: 0 }], ['Q-GAI-GF-001', { tab: 'qa', steps: 0 }], ['PR-01', { tab: 'pr', steps: STEPS }]]);

test('a record read back keeps what is valid and drops what is not, so a hand-edited or damaged file cannot put a state on the page that the page cannot draw', () => {
  assert.deepEqual(sanitize('sd', { s: 'Completed', c: 4, n: 'ok', d: '2026-11-16' }, C), { s: 'Completed', c: 4, n: 'ok', d: '2026-11-16' });
  assert.deepEqual(sanitize('sd', { s: 'Finished', c: 9, n: 42, d: '2026-02-30' }, C), null, 'nothing valid, nothing kept');
  assert.deepEqual(sanitize('sd', { s: 'Completed', c: 9, d: 'someday' }, C), { s: 'Completed' }, 'the valid part is kept');
  assert.deepEqual(sanitize('sd', { s: 'Not Started' }, C), null, 'a blank record is nothing');
  assert.equal(sanitize('sd', { n: 'x'.repeat(C.maxNoteChars + 100) }, C).n.length, C.maxNoteChars, 'a note is cut at the limit');
  assert.deepEqual(sanitize('qa', { s: 'Mastered' }, C), { s: 'Mastered' });
  assert.equal(sanitize('qa', { s: 'Completed' }, C), null, 'a status of another sheet is not this sheet’s');
  assert.deepEqual(sanitize('pr', { p: '2100000' }, C, STEPS), { p: '2100000' });
  assert.equal(sanitize('pr', { p: '2100000000' }, C, STEPS), null, 'more steps than there are');
  assert.equal(sanitize('pr', { p: '2x00000' }, C, STEPS), null, 'a step that is not 0, 1 or 2');
  assert.equal(sanitize('sd', [], C), null);
  assert.equal(sanitize('sd', 'Completed', C), null);
  assert.equal(sanitize('sd', null, C), null);
});

test('a backup and the browser’s own copy are read back: unknown ids are counted and left out, and anything that is not ours is refused', () => {
  const records = new Map([['SD-A-001', { s: 'Completed', c: 3, d: '2026-11-16', n: 'redo' }], ['PR-01', { p: '2100000' }], ['Q-GAI-GF-001', { s: 'Mastered' }]]);
  const backup = readRecords(backupText(records, '2026-11-16T10:00:00Z', C), KNOWN, C);
  assert.deepEqual([...backup.records], [...records]);
  assert.equal(backup.ignored, 0);
  const stored = readRecords(serialize(records, C), KNOWN, C, 'version');
  assert.deepEqual([...stored.records], [...records]);
  const odd = JSON.stringify({ tracker: C.backupVersion, items: { 'SD-A-001': { s: 'Completed' }, 'SD-Z-999': { s: 'Completed' }, 'PR-01': { p: 'nope' } } });
  const read = readRecords(odd, KNOWN, C);
  assert.deepEqual([...read.records.keys()], ['SD-A-001']);
  assert.equal(read.ignored, 2, 'an id that is not an item, and a record with nothing valid');
  assert.equal(readRecords('not json', KNOWN, C).error, 'format');
  assert.equal(readRecords('[]', KNOWN, C).error, 'format');
  assert.equal(readRecords(JSON.stringify({ items: {} }), KNOWN, C).error, 'format', 'a file with no marker is not a backup');
  assert.equal(readRecords(JSON.stringify({ tracker: 99, items: {} }), KNOWN, C).error, 'format', 'nor is one of another version');
  assert.equal(readRecords(JSON.stringify({ tracker: C.backupVersion, items: [] }), KNOWN, C).error, 'format');
  assert.equal(readRecords(serialize(records, C), KNOWN, C).error, 'format', 'the browser’s copy is not a backup file');
  assert.equal(readRecords('x'.repeat(C.maxBackupBytes + 1), KNOWN, C).error, 'size');
});

test('a record keeps the second it was changed, and a reset row is remembered, in the browser\'s copy: what lets two devices that sync decide which is newer', () => {
  assert.deepEqual(sanitize('sd', { s: 'Completed', c: 4, u: 1800000000 }, C), { s: 'Completed', c: 4, u: 1800000000 }, 'the stamp is kept');
  assert.deepEqual(sanitize('sd', { s: 'Completed', u: -5 }, C), { s: 'Completed' }, 'a stamp that is not a positive whole number is dropped');
  assert.deepEqual(sanitize('sd', { s: 'Completed', u: '1800000000' }, C), { s: 'Completed' });
  assert.equal(sanitize('sd', { u: 1800000000 }, C), null, 'a stamp alone is not a record');
  assert.deepEqual(compact('sd', { ...blankRecord('sd', C), s: 'Completed', u: 5 }, C), { s: 'Completed' }, 'compact is about what the reader wrote: the page adds the stamp after');

  const records = new Map([['SD-A-001', { s: 'Completed', u: 1800000000 }]]);
  const removed = new Map([['PR-01', 1800000100]]);
  const read = readRecords(serialize(records, C, removed), KNOWN, C, 'version');
  assert.deepEqual([...read.records], [...records]);
  assert.deepEqual([...read.removed], [...removed]);
  assert.equal(JSON.parse(serialize(records, C)).removed, undefined, 'without a reset row there is no `removed` in the copy');

  const odd = JSON.stringify({ version: C.storageVersion, items: {}, removed: { 'PR-01': 7, 'SD-Z-999': 8, 'Q-GAI-GF-001': -1, 'SD-A-001': 'x' } });
  assert.deepEqual([...readRecords(odd, KNOWN, C, 'version').removed], [['PR-01', 7]], 'only known items, with a positive whole second');
  assert.equal(readRecords(backupText(records, '2026-11-16T10:00:00Z', C), KNOWN, C).removed.size, 0, 'a backup file has none');
});
