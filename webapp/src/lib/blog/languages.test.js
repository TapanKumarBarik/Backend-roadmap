import test from 'node:test';
import assert from 'node:assert/strict';
import { CODE_LANGUAGES, DIAGRAM_LANGUAGE } from './languages.js';
import { LANGUAGE_PATTERN } from './limits.js';
import { sanitizeDoc } from './sanitizeDoc.js';
import { supports, tokens } from '../markdown/highlighter.js';

test('every language an author can pick is one the highlighter colours, or the diagram language, or plain text', () => {
  for (const { id, label } of CODE_LANGUAGES) {
    assert.ok(label, id);
    if (id === '' || id === DIAGRAM_LANGUAGE) continue;
    assert.ok(supports(id), `${id} is offered in the studio but the highlighter does not colour it`);
  }
  assert.equal(new Set(CODE_LANGUAGES.map((l) => l.id)).size, CODE_LANGUAGES.length, 'no language is listed twice');
});

test('every language an author can pick is kept by the server when the document is saved', () => {
  for (const { id } of CODE_LANGUAGES.filter((l) => l.id)) {
    assert.match(id, LANGUAGE_PATTERN, id);
    const { doc, dropped } = sanitizeDoc({ type: 'doc', content: [{ type: 'codeBlock', attrs: { language: id }, content: [{ type: 'text', text: 'x' }] }] });
    assert.equal(doc.content[0].attrs.language, id, id);
    assert.deepEqual(dropped, []);
  }
});

test('the highlighter gives the editor its colours as ranges', () => {
  const code = 'func main() {\n\tfmt.Println("hi")\n}\n';
  const ranges = tokens(code, 'go');
  assert.ok(ranges.some((r) => code.slice(r.from, r.to) === 'func'));
  assert.deepEqual(tokens(code, ''), [], 'plain text has none');
  assert.deepEqual(tokens(code, 'mermaid'), [], 'a diagram is not coloured');
  assert.deepEqual(tokens(code, 'no-such-language'), []);
});
