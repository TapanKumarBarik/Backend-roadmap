import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseClock, formatClock, formatTotal, isoDuration, parseChapterLine, chapterLine, parseChapters, firstParagraph,
  cleanTitle, moduleFile, resolveVideos, groupByModule, totals, nextVideo, isPublic, isFresh, nextRelease, releaseDay
} from './videos.js';

test('clock times read and print both ways', () => {
  assert.equal(parseClock('2:24'), 144);
  assert.equal(parseClock('0:00'), 0);
  assert.equal(parseClock('10:05'), 605);
  assert.equal(parseClock('1:02:05'), 3725);
  assert.equal(formatClock(144), '2:24');
  assert.equal(formatClock(3725), '1:02:05');
  assert.equal(formatClock(59.6), '1:00');
  for (const s of [0, 9, 60, 605, 3599, 3600, 7322]) assert.equal(parseClock(formatClock(s)), s);
});

test('text that is not a clock time is not read as one', () => {
  for (const bad of ['', 'abc', '2:75', '1:75:00', '24', '1:2', '12:345', '-1:00']) assert.equal(parseClock(bad), null, bad);
});

test('a length is written the way structured data wants it', () => {
  assert.equal(isoDuration(144), 'PT2M24S');
  assert.equal(isoDuration(60), 'PT1M');
  assert.equal(isoDuration(59), 'PT59S');
  assert.equal(isoDuration(3600), 'PT1H');
  assert.equal(isoDuration(3725), 'PT1H2M5S');
  assert.equal(isoDuration(0), 'PT0S');
});

test('a total reads as hours and minutes', () => {
  assert.equal(formatTotal(12120), '3 h 22 min');
  assert.equal(formatTotal(7200), '2 h');
  assert.equal(formatTotal(1500), '25 min');
});

const LESSON_1 = `What is system design, really? In this first lesson you'll learn how requirements turn into an architecture.

We follow a simple FastAPI app as it grows from a single server into a multi-tier system.

⏱️ Chapters
0:00 Intro: What is system design?
0:10 Requirements → architecture
0:27 HLD vs LLD
0:45 Example: a FastAPI app on one server
1:04 Scaling to a multi-tier system
1:22 Every step is a trade-off
1:40 What interviewers evaluate
2:00 Recap + interview questions

🎯 Interview questions covered
What does a system design interview evaluate? → How you think.`;

test('chapters are read from a real description, in order, with their names trimmed', () => {
  const chapters = parseChapters(LESSON_1);
  assert.equal(chapters.length, 8);
  assert.deepEqual(chapters[0], [0, 'Intro: What is system design?']);
  assert.deepEqual(chapters[2], [27, 'HLD vs LLD']);
  assert.deepEqual(chapters[7], [120, 'Recap + interview questions']);
});

test('a chapter list YouTube would not show is not returned', () => {
  assert.deepEqual(parseChapters('0:00 One\n0:30 Two'), [], 'fewer than three');
  assert.deepEqual(parseChapters('0:05 One\n0:30 Two\n1:00 Three'), [], 'does not start at 0:00');
  assert.deepEqual(parseChapters('0:00 One\n1:00 Two\n0:30 Three'), [], 'runs backwards');
  assert.deepEqual(parseChapters(''), []);
  assert.deepEqual(parseChapters(undefined), []);
});

test('a chapter line round-trips', () => {
  assert.deepEqual(parseChapterLine('1:14 Option 1: polling'), [74, 'Option 1: polling']);
  assert.equal(chapterLine([74, 'Option 1: polling']), '1:14 Option 1: polling');
  assert.equal(parseChapterLine('no time here'), null);
});

test('the first paragraph of a description is what summarises it', () => {
  assert.equal(firstParagraph(LESSON_1), "What is system design, really? In this first lesson you'll learn how requirements turn into an architecture.");
  const long = firstParagraph('word '.repeat(200), 50);
  assert.ok(long.length <= 51 && long.endsWith('…'));
});

// Every pattern the channel's titles actually use.
test('the series is taken off a title and its number kept', () => {
  const cases = [
    ['What Is System Design? HLD vs LLD Explained | System Design Interview Prep (Lesson 1)', 'What Is System Design? HLD vs LLD Explained', 1],
    ['Client-Server & Multi-Tier Architecture Explained (1, 2, 3 & N-Tier) | System Design Lesson 2', 'Client-Server & Multi-Tier Architecture Explained (1, 2, 3 & N-Tier)', 2],
    ['Functional Requirements in System Design (URL Shortener & Chat App Examples) | Lesson 3', 'Functional Requirements in System Design (URL Shortener & Chat App Examples)', 3],
    ['API Pagination: Offset vs Cursor & Why Deep Pages Are Slow | System Design Phase 2 #27', 'API Pagination: Offset vs Cursor & Why Deep Pages Are Slow', 27],
    ['CAP Theorem Explained Properly (It\'s NOT "Pick Two") | CP vs AP | System Design Lesson 13', 'CAP Theorem Explained Properly (It\'s NOT "Pick Two") | CP vs AP', 13]
  ];
  for (const [raw, title, number] of cases) assert.deepEqual(cleanTitle(raw), { title, number }, raw);
});

test('stray spacing in a title is tidied, and a title without a series is left as it is', () => {
  assert.equal(cleanTitle('Single Point of Failure (SPOF) Explained:  Active-Passive | System Design Lesson 17').title, 'Single Point of Failure (SPOF) Explained: Active-Passive');
  assert.equal(cleanTitle('Stateless vs Stateful : Sessions | System Design Lesson 19').title, 'Stateless vs Stateful: Sessions');
  assert.equal(cleanTitle('Simple Beats Clever: Cost & Complexity(YAGNI, TCO) | System Design Lesson 18').title, 'Simple Beats Clever: Cost & Complexity (YAGNI, TCO)');
  assert.deepEqual(cleanTitle('A one-off video'), { title: 'A one-off video', number: null });
});

const registry = {
  playlists: [{ id: 'one' }, { id: 'two' }],
  videos: [
    { id: 'bbbbbbbbbbb', title: 'Second playlist, first', playlist: 'two', number: 1, published: '2026-10-29T00:00:00Z', module: 'x/a' },
    { id: 'ccccccccccc', title: 'First playlist, second', playlist: 'one', number: 2, published: '2026-10-28T00:00:00Z', module: 'x/a', seconds: 100, chapters: ['0:00 A', '0:10 B', '0:20 C'] },
    { id: 'ddddddddddd', title: 'First playlist, first', playlist: 'one', number: 1, published: '2026-10-27T00:00:00Z' }
  ]
};

test('videos come out in playlist order, then by number, with their module as the key the app uses', () => {
  const videos = resolveVideos(registry);
  assert.deepEqual(videos.map((v) => v.title), ['First playlist, first', 'First playlist, second', 'Second playlist, first']);
  assert.equal(videos[0].file, null);
  assert.equal(videos[1].file, moduleFile('x/a'));
  assert.equal(videos[1].seconds, 100);
  assert.deepEqual(videos[1].chapters, [[0, 'A'], [10, 'B'], [20, 'C']]);
  assert.equal(videos[0].seconds, null);
});

test('modules collect their videos, and a video with no module belongs to none', () => {
  const videos = resolveVideos(registry);
  const byFile = groupByModule(videos);
  assert.deepEqual(Object.keys(byFile), ['x/a/README.md']);
  assert.deepEqual(byFile['x/a/README.md'].map((v) => v.id), ['ccccccccccc', 'bbbbbbbbbbb']);
  assert.deepEqual(totals(videos), { count: 3, seconds: 100 });
});

test('the next video is the next number in the same playlist, and there is none at the end', () => {
  const list = [
    { id: 'a', playlist: 'p1', number: 1 }, { id: 'b', playlist: 'p1', number: 2 }, { id: 'c', playlist: 'p2', number: 3 }, { id: 'd', playlist: 'p1', number: 4 }
  ];
  assert.equal(nextVideo(list, list[0]).id, 'b');
  assert.equal(nextVideo(list, list[1]).id, 'd', 'a number that is missing is skipped');
  assert.equal(nextVideo(list, list[3]), null);
  assert.equal(nextVideo(list, list[2]), null, 'another playlist is another series');
});

test('a video is public from its published time on; one with no time is public', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  assert.equal(isPublic({ published: '2026-11-06T11:59:59Z' }, now), true);
  assert.equal(isPublic({ published: '2026-11-06T12:00:00Z' }, now), true, 'at the minute it goes live');
  assert.equal(isPublic({ published: '2026-11-06T12:00:01Z' }, now), false, 'a scheduled video is not listed yet');
  assert.equal(isPublic({}, now), true);
  assert.equal(isPublic({ published: '' }, now), true);
  assert.equal(isPublic({ published: 'not a date' }, now), false, 'a time nobody can read is not a reason to list it');
  assert.equal(isPublic({ published: '2000-01-01T00:00:00Z' }), true, 'with no clock given it is now');
});

test('a video is new for two days after it goes public, and never before', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  assert.equal(isFresh({ published: '2026-11-10T06:00:00Z' }, now), true);
  assert.equal(isFresh({ published: '2026-11-08T12:00:01Z' }, now), true, 'just under two days');
  assert.equal(isFresh({ published: '2026-11-08T12:00:00Z' }, now), false, 'two days is old');
  assert.equal(isFresh({ published: '2026-11-11T06:00:00Z' }, now), false, 'a scheduled video is not new yet');
  assert.equal(isFresh({}, now), false);
  assert.equal(isFresh({ published: 'nope' }, now), false);
});

test('the next release is the scheduled video with the earliest time', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const list = [
    { id: 'old', published: '2026-11-01T00:00:00Z' },
    { id: 'later', published: '2026-11-13T00:00:00Z' },
    { id: 'soon', published: '2026-11-11T00:00:00Z' },
    { id: 'undated' }
  ];
  assert.equal(nextRelease(list, now).id, 'soon');
  assert.equal(nextRelease([list[0], list[3]], now), null, 'nothing scheduled');
  assert.equal(nextRelease([], now), null);
});

test('a time is today or tomorrow by the calendar day of whoever is reading', () => {
  // Built from local parts, so the answer does not depend on the machine's time zone.
  const at = (day, hour) => new Date(2026, 10, day, hour, 0, 0).toISOString();
  const now = new Date(2026, 10, 10, 23, 30, 0).getTime();
  assert.equal(releaseDay(at(10, 0), now), 'today');
  assert.equal(releaseDay(at(11, 0), now), 'tomorrow', 'half an hour later, but the next calendar day');
  assert.equal(releaseDay(at(12, 9), now), null);
  assert.equal(releaseDay(at(9, 9), now), null, 'yesterday is neither');
  assert.equal(releaseDay('nope', now), null);
});
