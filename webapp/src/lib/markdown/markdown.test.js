import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNewlines, renderMarkdownDoc, splitTitle } from './markdown.js';

const lesson = '# Sessions\n\n> [!key] Never trust the client\n> The second line of the callout.\n\nA paragraph about cookies.\n';

test('a lesson renders the same whatever line endings it was saved with', () => {
  const html = renderMarkdownDoc(lesson);
  assert.equal(renderMarkdownDoc(lesson.replace(/\n/g, '\r\n')), html, 'Windows line endings');
  assert.equal(renderMarkdownDoc(lesson.replace(/\n/g, '\r')), html, 'old Mac line endings');
});

test('a callout becomes a block, not a quotation that prints its marker', () => {
  const html = renderMarkdownDoc(lesson.replace(/\n/g, '\r\n'));
  assert.match(html, /cblock cblock-key/);
  assert.doesNotMatch(html, /\[!key\]/);
});

test('the title is lifted out of the page body', () => {
  const { title, body } = splitTitle(renderMarkdownDoc(lesson));
  assert.equal(title, 'Sessions');
  assert.ok(!body.includes('<h1'));
});

test('every kind of line ending becomes a plain newline', () => {
  assert.equal(normalizeNewlines('a\r\nb\rc\nd'), 'a\nb\nc\nd');
});

test('an approximation sign is not a strikethrough', () => {
  // Older versions of the markdown library read "~evenly (~2,500 each)" as struck-out text; ten places in the lessons did.
  const html = renderMarkdownDoc('Hash-based spreads them ~evenly (~2,500 each), about ~8% and ~15% of samples.\n');
  assert.doesNotMatch(html, /<del>/);
  assert.match(html, /~evenly \(~2,500 each\)/);
});

test('two tildes still strike text through', () => {
  assert.match(renderMarkdownDoc('This is ~~wrong~~ right.\n'), /<del>wrong<\/del>/);
});
