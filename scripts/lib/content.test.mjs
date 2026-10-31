import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.mjs';
import { extractTitle, humanize, markdownFiles, readText, readingFacts, readingMinutes } from './content.mjs';

const words = (n) => Array.from({ length: n }, () => 'word').join(' ');
const wpm = config.content.wordsPerMinute;

test('a folder name becomes a readable title', () => {
  assert.equal(humanize('03-api-layer'), 'Api Layer');
  assert.equal(humanize('oop_foundations'), 'Oop Foundations');
  assert.equal(humanize('README'), 'Readme');
});

test('the title is the first top-level heading, not a sub-heading and not the fallback', () => {
  assert.equal(extractTitle('intro text\n\n## Not this\n# The title  \n# Not this either\n', 'fallback'), 'The title');
  assert.equal(extractTitle('## Only a sub-heading\ntext', 'fallback'), 'fallback');
});

test('reading time counts the words a reader reads and skips code blocks', () => {
  assert.equal(readingMinutes(words(wpm)), 1);
  assert.equal(readingMinutes(words(wpm * 3)), 3);
  assert.equal(readingMinutes(`${words(wpm)}\n\`\`\`js\n${words(wpm * 10)}\n\`\`\`\n`), 1);
  assert.equal(readingMinutes(''), 1, 'never less than a minute');
});

test('a lesson that still carries the placeholder sentence is planned', () => {
  const placeholder = `# Module\n\nThis module ${config.content.placeholderMarker}.\n`;
  assert.equal(readingFacts(placeholder).planned, true);
  assert.equal(readingFacts(`# Module\n\n${words(50)}\n`).planned, false);
});

test('the Windows line endings of a checkout read as the same text as the repository', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-'));
  fs.writeFileSync(path.join(dir, 'a.md'), '# Title\r\nline\r\n');
  assert.equal(readText(path.join(dir, 'a.md')), '# Title\nline\n');
});

test('the lesson files exclude notes for the author and folders that never hold lessons', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-'));
  const write = (rel) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), '# x');
  };
  write('b/README.md');
  write('a/README.md');
  write('a/node_modules/lib/README.md');
  write('a/STATUS.md');
  write('a/diagram.svg');
  assert.deepEqual(markdownFiles(dir).map((f) => path.relative(dir, f).split(path.sep).join('/')), ['a/README.md', 'b/README.md']);
});
