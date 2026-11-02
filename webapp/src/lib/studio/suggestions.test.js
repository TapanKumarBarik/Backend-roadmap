import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineNodes, outlineNodes, paragraphNodes, tocNodes } from './suggestions.js';
import { sanitizeDoc } from '../blog/sanitizeDoc.js';

const t = (text) => ({ type: 'text', text });
const heading = (level, text) => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const doc = (...content) => ({ type: 'doc', content });
const keeps = (nodes) => assert.deepEqual(sanitizeDoc(doc(...nodes)).dropped, [], 'the server keeps all of it');

test('text becomes words and line breaks, and a blank line is a new paragraph', () => {
  assert.deepEqual(inlineNodes('one\ntwo'), [t('one'), { type: 'hardBreak' }, t('two')]);
  assert.deepEqual(inlineNodes(''), []);
  assert.deepEqual(paragraphNodes('First paragraph.\n\nSecond one,\nover two lines.\n\n\n\n'), [
    { type: 'paragraph', content: [t('First paragraph.')] },
    { type: 'paragraph', content: [t('Second one,'), { type: 'hardBreak' }, t('over two lines.')] }
  ]);
});

test('markup in a suggestion stays words: nothing is parsed', () => {
  const [paragraph] = paragraphNodes('<script>alert(1)</script> & <b>bold</b>');
  assert.deepEqual(paragraph.content, [t('<script>alert(1)</script> & <b>bold</b>')]);
  keeps([paragraph]);
});

test('an outline becomes headings, each with a list of its points, and nothing else gets in', () => {
  const blocks = outlineNodes('## Why it matters\n- the cost\n- the risk\nchatter\n## Fixes\n- keys\n##\n-\n# Not this');
  assert.deepEqual(blocks.map((b) => b.type), ['heading', 'bulletList', 'heading', 'bulletList']);
  assert.equal(blocks[0].content[0].text, 'Why it matters');
  assert.equal(blocks[1].content.length, 2);
  assert.equal(blocks[1].content[1].content[0].content[0].text, 'the risk');
  assert.deepEqual(outlineNodes('no structure at all'), []);
  keeps(blocks);
});

test('a table of contents lists the headings as links to them, sub-headings nested', () => {
  const body = doc(heading(2, 'Why retries'), heading(3, 'The cost'), heading(3, 'The risk'), heading(2, 'Fixes'), heading(2, 'Why retries'));
  const [list] = tocNodes(body);
  assert.equal(list.content.length, 3, 'three top-level entries');
  const first = list.content[0];
  assert.equal(first.content[0].content[0].marks[0].attrs.href, '#why-retries');
  assert.equal(first.content[1].content.length, 2, 'two sub-headings nested under the first');
  assert.equal(list.content[2].content[0].content[0].marks[0].attrs.href, '#why-retries-1', 'a repeated heading gets the page\'s second id');
  keeps([list]);
  assert.equal(tocNodes(doc(heading(2, 'Only one'))), null, 'one heading is not worth a list');
  assert.equal(tocNodes(doc({ type: 'paragraph', content: [t('no headings')] })), null);
});
