import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, plural, readingTime } from './format.js';

test('a date is written the same wherever it is drawn', () => {
  assert.equal(formatDate('2026-11-02T10:00:00.000Z'), 'Nov 2, 2026');
  assert.equal(formatDate('2026-11-02T23:59:59.000Z'), 'Nov 2, 2026', 'UTC, not the reader\'s clock');
  assert.equal(formatDate('nonsense'), '');
  assert.equal(formatDate(null), '');
  assert.equal(formatDate(undefined), '');
});

test('reading time and counts', () => {
  assert.equal(readingTime(5), '5 min read');
  assert.equal(readingTime(0), '1 min read');
  assert.equal(readingTime(undefined), '1 min read');
  assert.equal(plural(1, 'like'), '1 like');
  assert.equal(plural(12, 'like'), '12 likes');
  assert.equal(plural(0, 'reply', 'replies'), '0 replies');
});
