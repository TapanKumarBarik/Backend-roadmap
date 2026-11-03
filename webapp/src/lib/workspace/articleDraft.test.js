import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOG } from '../blog/limits.js';
import { DocError, sanitizeDoc } from '../blog/sanitizeDoc.js';
import { articleDraftFrom, fitsInArticle, hasText, withoutBlockIds } from './articleDraft.js';

const text = (t) => ({ type: 'text', text: t });
const para = (t, id = 'p') => ({ type: 'paragraph', attrs: { id }, content: [text(t)] });
const doc = (...content) => ({ type: 'doc', content });

test('the ids the workspace editor puts on every block are left out of the copy, and nothing else is', () => {
  const source = doc({ type: 'heading', attrs: { id: 'h', level: 2 }, content: [text('Title')] }, para('Body', 'b'));
  const copy = withoutBlockIds(source);
  assert.deepEqual(copy, doc({ type: 'heading', attrs: { level: 2 }, content: [text('Title')] }, { type: 'paragraph', content: [text('Body')] }));
  assert.equal(source.content[1].attrs.id, 'b', 'the page itself is not changed');
});

test('a page with no words has nothing to copy', () => {
  assert.equal(hasText(doc({ type: 'paragraph' })), false);
  assert.equal(hasText(doc(para('   '))), false);
  assert.equal(hasText(doc(para('Words'))), true);
  assert.equal(hasText(null), false);
});

test('the draft is titled by the page, cut to what an article title may be', () => {
  assert.equal(articleDraftFrom('  My notes  ', doc(para('x'))).title, 'My notes');
  assert.equal(articleDraftFrom('t'.repeat(500), doc(para('x'))).title.length, BLOG.titleMax);
});

test('a copy that is too long for an article is noticed before it is sent', () => {
  assert.equal(fitsInArticle(articleDraftFrom('t', doc(para('short')))), true);
  assert.equal(fitsInArticle(articleDraftFrom('t', doc(para('x'.repeat(BLOG.docBytesMax))))), false);
});

test('what the editor produces survives the studio\'s own rules: to-dos, tables and a level 1 heading come through as an allowed document', () => {
  const page = doc(
    { type: 'heading', attrs: { id: 'a', level: 1 }, content: [text('Notes')] },
    { type: 'taskList', attrs: { id: 'b' }, content: [{ type: 'taskItem', attrs: { id: 'c', checked: true }, content: [para('Read the docs')] }] },
    { type: 'table', attrs: { id: 'd' }, content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [para('cell')] }] }] },
    { type: 'paragraph', attrs: { id: 'e' }, content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }] }
  );
  const { content } = articleDraftFrom('Notes', page);
  const { doc: cleaned } = sanitizeDoc(content, {});
  assert.equal(cleaned.content[0].attrs.level, 2, 'a level 1 heading becomes the smallest the studio allows');
  assert.deepEqual(cleaned.content.map((n) => n.type), ['heading', 'taskList', 'table', 'paragraph']);
  assert.throws(() => sanitizeDoc('not a document', {}), DocError);
});
