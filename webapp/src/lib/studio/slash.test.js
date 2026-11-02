import test from 'node:test';
import assert from 'node:assert/strict';
import { matchCommands, slashQuery } from './slash.js';

test('a slash that starts a line or follows a space opens the menu, and what follows it is the query', () => {
  assert.deepEqual(slashQuery('/'), { query: '', length: 1 });
  assert.deepEqual(slashQuery('/head'), { query: 'head', length: 5 });
  assert.deepEqual(slashQuery('Some text /Code'), { query: 'code', length: 5 });
  assert.deepEqual(slashQuery('a /c++'), { query: 'c++', length: 4 });
  assert.deepEqual(slashQuery('/h2'), { query: 'h2', length: 3 });
});

test('a slash inside a word, an address or a finished command is just text', () => {
  for (const text of ['', 'plain', 'and/or', 'https://example.com/path', 'a /two words', '/heading ', 'a/', '1/2', '/this-is-a-very-long-thing-that-is-not-a-command']) {
    assert.equal(slashQuery(text), null, JSON.stringify(text));
  }
});

const COMMANDS = [
  { id: 'h2', label: 'Heading', keywords: ['title', 'section', 'h2'] },
  { id: 'h3', label: 'Subheading', keywords: ['h3', 'subsection'] },
  { id: 'bullets', label: 'Bulleted list', keywords: ['ul', 'list', 'unordered'] },
  { id: 'numbers', label: 'Numbered list', keywords: ['ol', 'list', 'ordered'] },
  { id: 'code', label: 'Code block', keywords: ['pre', 'snippet', 'code'] },
  { id: 'quote', label: 'Quote', keywords: ['blockquote', 'cite'] }
];

test('with nothing typed every command is offered, in its own order', () => {
  assert.deepEqual(matchCommands(COMMANDS, '').map((c) => c.id), COMMANDS.map((c) => c.id));
});

test('a label that starts with the query comes first, then a keyword that does, then one that merely has it', () => {
  assert.deepEqual(matchCommands(COMMANDS, 'h').map((c) => c.id), ['h2', 'h3'], 'Heading starts with "h"; Subheading only has the keyword h3');
  assert.deepEqual(matchCommands(COMMANDS, 'head').map((c) => c.id), ['h2', 'h3'], 'Heading starts with it; Subheading has it inside');
  assert.deepEqual(matchCommands(COMMANDS, 'sub').map((c) => c.id), ['h3'], 'a label that starts with it');
  assert.deepEqual(matchCommands(COMMANDS, 'list').map((c) => c.id), ['bullets', 'numbers'], 'by keyword (and inside the label), in their own order');
  assert.deepEqual(matchCommands(COMMANDS, 'ord').map((c) => c.id), ['numbers', 'bullets'], 'the keyword "ordered" starts with it; "unordered" only has it inside');
  assert.deepEqual(matchCommands(COMMANDS, 'number').map((c) => c.id), ['numbers'], 'a label that starts with it');
  assert.deepEqual(matchCommands(COMMANDS, 'snip').map((c) => c.id), ['code']);
  assert.deepEqual(matchCommands(COMMANDS, 'zzz'), []);
});

test('the query is not case sensitive and is trimmed', () => {
  assert.deepEqual(matchCommands(COMMANDS, '  CODE ').map((c) => c.id), ['code']);
});
