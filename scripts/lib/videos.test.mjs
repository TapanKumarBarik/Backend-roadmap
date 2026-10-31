import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistry, serializeRegistry, fileCounts } from './videos.mjs';
import { parseFeed, toUtc, inferLesson } from './youtubeFeed.mjs';

const folders = new Set(['backend/01-x/02-y', 'system-design/01-core/01-intro']);
const where = { hasModule: (folder) => folders.has(folder) };

const playlists = [
  { id: 'phase-1', title: 'Phase 1', url: 'https://www.youtube.com/playlist?list=PLdZs-f1PXX48' },
  { id: 'phase-2', title: 'Phase 2', url: 'https://www.youtube.com/playlist?list=PLEBaLYrJs0lI' }
];
const video = (extra = {}) => ({
  id: 'aNVDz45U-cM', title: 'What Is System Design?', playlist: 'phase-1', number: 1, published: '2026-10-28T06:20:22Z',
  module: 'system-design/01-core/01-intro', seconds: 144, chapters: ['0:00 One', '0:30 Two', '1:00 Three'], ...extra
});

test('a well-formed registry has nothing wrong with it', () => {
  assert.deepEqual(validateRegistry({ playlists, videos: [video()] }, where), []);
  assert.deepEqual(validateRegistry({ playlists, videos: [video({ module: undefined, chapters: undefined, seconds: undefined })] }, where), [], 'only the essentials');
});

test('a registry that is not the right shape says so', () => {
  assert.equal(validateRegistry(/** @type {any} */ ({}), where).length, 1);
  assert.equal(validateRegistry(/** @type {any} */ (null), where).length, 1);
});

test('every kind of mistake in a video is reported in words', () => {
  /** @type {Array<[any, RegExp]>} */
  const cases = [
    [video({ id: 'short' }), /not a YouTube video id/],
    [video({ playlist: 'phase-9' }), /playlist "phase-9"/],
    [video({ number: 0 }), /"number"/],
    [video({ published: '28 Oct 2026' }), /"published"/],
    [video({ seconds: 1.5 }), /"seconds"/],
    [video({ module: 'backend/01-x/03-missing' }), /no module at content\/backend\/01-x\/03-missing\/README\.md/],
    [video({ module: 'backend/01-x/02-y/README.md' }), /"module" is a folder/],
    [video({ module: '/backend/01-x/02-y' }), /"module" is a folder/],
    [video({ chapters: ['0:00 One', 'oops'] }), /every chapter is a line/],
    [video({ chapters: ['0:00 One', '0:30 Two'] }), /at least three/],
    [video({ chapters: ['0:10 One', '0:30 Two', '1:00 Three'] }), /start at 0:00/],
    [video({ chapters: ['0:00 One', '1:00 Two', '0:30 Three'] }), /run forward/],
    [video({ chapters: ['0:00 One', '0:30 Two', '3:00 Three'] }), /after the video ends/],
    [video({ modul: 'typo' }), /unknown field "modul"/]
  ];
  for (const [entry, expected] of cases) {
    const problems = validateRegistry({ playlists, videos: [entry] }, where);
    assert.ok(problems.some((p) => expected.test(p)), `${JSON.stringify(entry).slice(0, 80)} -> ${problems.join(' | ')}`);
  }
});

test('the same video, number or lesson twice is caught', () => {
  const twice = validateRegistry({ playlists, videos: [video({ lesson: 'SD-A-001' }), video({ lesson: 'SD-A-001' })] }, where);
  assert.ok(twice.some((p) => /listed twice/.test(p)));
  assert.ok(twice.some((p) => /number 1 is already used/.test(p)));
  assert.ok(twice.some((p) => /lesson id SD-A-001 is used twice/.test(p)));
});

test('a playlist needs a real address', () => {
  const problems = validateRegistry({ playlists: [{ id: 'p', title: 'P', url: 'https://example.com/list' }], videos: [] }, where);
  assert.ok(problems.some((p) => /needs a url/.test(p)));
});

test('the registry is written with videos in playlist order, then by number', () => {
  const written = JSON.parse(serializeRegistry({
    playlists,
    videos: [video({ id: 'bbbbbbbbbbb', playlist: 'phase-2', number: 1 }), video({ id: 'ccccccccccc', number: 2 }), video({ id: 'aaaaaaaaaaa', number: 1 })]
  }));
  assert.deepEqual(written.videos.map((v) => v.id), ['aaaaaaaaaaa', 'ccccccccccc', 'bbbbbbbbbbb']);
  assert.ok(serializeRegistry({ playlists, videos: [] }).endsWith('\n'));
});

test('modules count their videos by the README the app knows them by', () => {
  const counts = fileCounts({ playlists, videos: [video(), video({ id: 'bbbbbbbbbbb', number: 2 }), video({ id: 'ccccccccccc', number: 3, module: undefined })] });
  assert.deepEqual([...counts], [['system-design/01-core/01-intro/README.md', 2]]);
});

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>Tapan kumar Barik</title>
 <entry>
  <id>yt:video:MAYnlX-5I-A</id>
  <yt:videoId>MAYnlX-5I-A</yt:videoId>
  <title>Async APIs for Long Jobs: 202 Accepted | System Design Phase 2 #41</title>
  <published>2026-10-31T08:44:32+00:00</published>
  <media:group>
   <media:title>ignored</media:title>
   <media:description>A 300-page PDF takes 10 minutes &amp; more.

⏱️ Chapters
0:00 A 10-minute job
{ &quot;job_id&quot;: &quot;j_81&quot; }
◀️ Previous: SD-C-020 ▶️ Next: SD-C-022</media:description>
  </media:group>
 </entry>
 <entry>
  <yt:videoId>GrbGFtoEhys</yt:videoId>
  <title>Webhooks | System Design Phase 2 #40</title>
  <published>2026-10-31T08:42:04+00:00</published>
 </entry>
</feed>`;

test('a feed gives its videos back with the entities in their titles and descriptions decoded', () => {
  const entries = parseFeed(FEED);
  assert.deepEqual(entries.map((e) => e.id), ['MAYnlX-5I-A', 'GrbGFtoEhys']);
  assert.equal(entries[0].title, 'Async APIs for Long Jobs: 202 Accepted | System Design Phase 2 #41');
  assert.match(entries[0].description, /10 minutes & more\./);
  assert.match(entries[0].description, /\{ "job_id": "j_81" \}/);
  assert.equal(entries[1].description, '');
  assert.deepEqual(parseFeed('<feed></feed>'), []);
});

test('upload times become the UTC form the registry keeps', () => {
  assert.equal(toUtc('2026-10-31T08:44:32+00:00'), '2026-10-31T08:44:32Z');
  assert.equal(toUtc('2026-10-27T23:20:22-07:00'), '2026-10-28T06:20:22Z');
});

test('a lesson id is worked out from the neighbours a description links to', () => {
  assert.equal(inferLesson('Previous: SD-C-020 ▶️ Next: SD-C-022'), 'SD-C-021');
  assert.equal(inferLesson('▶️ Next lesson: SD-A-002 Client-Server'), 'SD-A-001', 'the first lesson has only a next');
  assert.equal(inferLesson('◀️ Previous: SD-A-019 ▶️ Next: SD-B-002'), 'SD-B-001', 'the first of a series follows the last of the one before');
  assert.equal(inferLesson('◀️ Previous: SD-B-019 ▶️ Next: SD-C-001'), 'SD-B-020', 'the last of a series precedes the first of the next');
  assert.equal(inferLesson('Previous: SD-C-021'), 'SD-C-022', 'the newest has no next yet');
  assert.equal(inferLesson('nothing to see'), null);
});
