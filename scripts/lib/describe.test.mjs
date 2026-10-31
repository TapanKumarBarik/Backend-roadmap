import test from 'node:test';
import assert from 'node:assert/strict';
import { descriptionCandidates, pickDescription, textOf } from './describe.mjs';

const para = (text) => `<p>${text}</p>`;
const LONG = 'A session system has three parts that each have a wrong way to do them, and getting any of them wrong is costly.';

test('paragraphs that look back at other modules are passed over', () => {
  const html = para('Module 00 told you that stateful auth stores identity server-side and hands the client an opaque ID.')
    + para('Track 04 ended on a preview of it: the cheapest query is the one you never run, which is where this track begins.')
    + para(LONG);
  assert.deepEqual(descriptionCandidates(html), [LONG]);
});

test('a look back at the start of a paragraph is dropped and the sentence after it kept', () => {
  const html = para('Module 00 told you that stateful auth stores identity on the server. This module is where you build it correctly, with a store, a transport and a lifecycle.')
    + para('By the end of track 02 you could design a clean, validated, versioned REST API, and this track secures it.');
  assert.deepEqual(descriptionCandidates(html), ['This module is where you build it correctly, with a store, a transport and a lifecycle.']);
});

test('short paragraphs are not descriptions, and markup and entities are read as text', () => {
  assert.deepEqual(descriptionCandidates(para('Too short.')), []);
  assert.equal(textOf('<p>Use <code>Cache-Control</code> &amp; ETag , please.</p>'), 'Use Cache-Control & ETag, please.');
});

test('a long paragraph is cut at a word, with an ellipsis, inside the limit', () => {
  const [d] = descriptionCandidates(para('word '.repeat(80)));
  assert.ok(d.length <= 160);
  assert.ok(d.endsWith('…'));
  assert.ok(!d.endsWith(' …'));
});

test('two pages never get the same description', () => {
  const taken = new Set();
  const first = pickDescription([LONG, 'The second paragraph of the module, which says something else entirely about it.'], taken, 'fallback one');
  const second = pickDescription([LONG, 'The second paragraph of the module, which says something else entirely about it.'], taken, 'fallback two');
  const third = pickDescription([LONG], taken, 'fallback three');
  assert.equal(first, LONG);
  assert.equal(second, 'The second paragraph of the module, which says something else entirely about it.');
  assert.equal(third, 'fallback three');
});
