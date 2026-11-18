import test from 'node:test';
import assert from 'node:assert/strict';
import { auditVideos, STATUS } from './videoAudit.mjs';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const playlists = [{ id: 'phase-1' }, { id: 'phase-2' }];
const v = (id, number, published, extra = {}) => ({ id, title: `Lesson ${number} title`, playlist: 'phase-2', number, published, ...extra });
const check = (status, title) => ({ status, ...(title && { title }) });
const audit = (videos, checks, listed = []) => auditVideos({ registry: { playlists, videos }, now: NOW, listed, checks: new Map(Object.entries(checks)) });

test('a registry that matches the channel has nothing wrong: public ones play, scheduled ones are private', () => {
  const result = audit(
    [v('aaaaaaaaaaa', 1, '2026-11-17T00:00:00Z'), v('bbbbbbbbbbb', 2, '2026-11-20T00:00:00Z')],
    { aaaaaaaaaaa: check(STATUS.public, 'Lesson 1 title | System Design Phase 2 #1'), bbbbbbbbbbb: check(STATUS.private) },
    ['aaaaaaaaaaa']
  );
  assert.deepEqual(result, { problems: [], notes: [], unchecked: 0 });
});

test('a public video that the registry lacks is named, with the command that adds it', () => {
  const result = audit([v('aaaaaaaaaaa', 1, '2026-11-17T00:00:00Z')], { aaaaaaaaaaa: check(STATUS.public) }, ['aaaaaaaaaaa', 'zzzzzzzzzzz']);
  assert.deepEqual(result.problems, ['zzzzzzzzzzz is public on the channel but is not in content/videos.json: run npm run videos:sync.']);
});

test('a video dated in the past that nobody can watch is a problem, whatever the reason', () => {
  const past = '2026-11-18T03:30:00Z';
  const says = (status) => audit([v('aaaaaaaaaaa', 67, past)], { aaaaaaaaaaa: check(status) }).problems.join(' | ');
  assert.match(says(STATUS.private), /phase-2 #67 \(aaaaaaaaaaa\) is dated 2026-11-18T03:30:00Z, which has passed, but it is private or still scheduled on YouTube: the site shows a video nobody can watch/);
  assert.match(says(STATUS.notEmbeddable), /public, but it cannot be embedded/);
  assert.match(says(STATUS.missing), /YouTube has no video with this id, so it can never play/);
});

test('a video dated in the future that is already public is a problem too: the site would hide it', () => {
  const result = audit([v('aaaaaaaaaaa', 78, '2026-11-20T13:30:00Z')], { aaaaaaaaaaa: check(STATUS.public, 'Lesson 78 title | System Design Phase 2 #78') });
  assert.match(result.problems[0], /dated 2026-11-20T13:30:00Z, which has not come, but it is already public: the site hides it until then/);
});

test('an id that belongs to another lesson is found by its number, or by its phase, on a video that is public', () => {
  const swapped = audit([v('aaaaaaaaaaa', 78, '2026-11-17T00:00:00Z')], { aaaaaaaaaaa: check(STATUS.public, 'Key-Value Stores | System Design Phase 2 #67') });
  assert.match(swapped.problems.join(' | '), /"Key-Value Stores \| System Design Phase 2 #67", which is a different video: its id is attached to the wrong lesson/);
  const otherPhase = audit([v('aaaaaaaaaaa', 5, '2026-11-17T00:00:00Z', { playlist: 'phase-1' })], { aaaaaaaaaaa: check(STATUS.public, 'Lesson 5 title | System Design Phase 2 #5') });
  assert.match(otherPhase.problems.join(' | '), /different video/);
});

test('a different wording with the same number is a note, not a problem; a title with no number cannot be compared and is let through', () => {
  const result = audit(
    [v('aaaaaaaaaaa', 5, '2026-11-17T00:00:00Z'), v('bbbbbbbbbbb', 101, '2026-11-03T00:00:00Z')],
    { aaaaaaaaaaa: check(STATUS.public, 'A newer headline | System Design Phase 2 #5'), bbbbbbbbbbb: check(STATUS.public, 'Lesson 101 title | System Design Phase 2') }
  );
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.notes, ['1 public video has a title on YouTube that is worded differently from the registry\'s (the number matches, so it is the right video).']);
});

test('a video with no answer is counted as unchecked, never called good or bad', () => {
  const result = audit([v('aaaaaaaaaaa', 1, '2026-11-17T00:00:00Z'), v('bbbbbbbbbbb', 2, '2026-11-17T00:00:00Z')], { aaaaaaaaaaa: check(0) });
  assert.deepEqual(result.problems, []);
  assert.equal(result.unchecked, 2);
  assert.deepEqual(result.notes, ['2 videos could not be checked (no answer from YouTube); run it again.']);
});
