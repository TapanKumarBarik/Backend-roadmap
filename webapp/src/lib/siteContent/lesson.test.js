import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessonProblems, MAX_LESSON_BYTES } from './lesson.js';

const PATH = 'learn/01-linux/README.md';
const SLIDE = '<!-- slide -->';

test('a lesson that starts with a title and has nothing the build rejects is good', () => {
  assert.deepEqual(lessonProblems(PATH, '# Linux\n\nSome text.\n'), []);
  assert.deepEqual(lessonProblems(PATH, '\n\n# Linux\r\n\r\nWindows line ends are fine.\r\n'), []);
});

test('empty text, a missing text and a lesson without a title are named', () => {
  assert.match(lessonProblems(PATH, '')[0], /empty/);
  assert.match(lessonProblems(PATH, '   \n\n')[0], /empty/);
  assert.match(lessonProblems(PATH, undefined)[0], /missing/);
  assert.match(lessonProblems(PATH, 'Just text, no title.\n')[0], /first line must be the title/);
  assert.match(lessonProblems(PATH, '## A second-level heading first\n')[0], /first line must be the title/);
});

test('a text that is far too large, or not text, is refused', () => {
  assert.match(lessonProblems(PATH, `# T\n${'x'.repeat(MAX_LESSON_BYTES)}`).join(' '), /over the 300 KB limit/);
  assert.match(lessonProblems(PATH, '# T\n\u0000\n').join(' '), /NUL/);
});

test('a carousel of several code blocks with no slide marker is named, with its line', () => {
  const broken = '# T\n\n````carousel\n```js\na\n```\n\n```py\nb\n```\n````\n';
  const problems = lessonProblems(PATH, broken);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /line 3: a carousel holds several code blocks/);
  const fixed = `# T\n\n\`\`\`\`carousel\n\`\`\`js\na\n\`\`\`\n\n${SLIDE}\n\n\`\`\`py\nb\n\`\`\`\n\`\`\`\`\n`;
  assert.deepEqual(lessonProblems(PATH, fixed), []);
});
