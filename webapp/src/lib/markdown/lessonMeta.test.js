import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relabelMeta } from './lessonMeta.js';
import { renderMarkdownDoc } from './markdown.js';
import { LESSON_META } from '../../config/lessonMeta.js';

const [[from, to]] = Object.entries(LESSON_META.relabel);

const opening = (label) => ['# Module 01: HTTP Protocol Basics', '', '> **Prerequisites:** DNS.  ', `> **${label}:** 30 minutes`, '> **Target Audience:** Backend Engineers.', ''].join('\n');

test('the label on the line that opens a lesson is renamed and the rest of the line is not touched', () => {
  assert.equal(relabelMeta(opening(from)), opening(to));
});

test('other labels, and the same words anywhere but the start of a quoted line, are left alone', () => {
  const text = `${opening('Estimated Time')}\nThe ${from} of a lab is **${from}:** in a sentence, and\n\n    > **${from}:** in an indented block\n`;
  assert.equal(relabelMeta(text), text);
});

test('a lesson with no such line comes back as it was', () => {
  const text = '# Title\n\nA paragraph.\n\n> [!tip]\n> A tip.\n';
  assert.equal(relabelMeta(text), text);
});

test('the page shows the new label, whatever line endings the lesson was saved with', () => {
  const html = renderMarkdownDoc(opening(from).replace(/\n/g, '\r\n'));
  assert.match(html, new RegExp(`<strong>${to}:</strong> 30 minutes`));
  assert.ok(!html.includes(from), 'the old label is gone from the page');
});
