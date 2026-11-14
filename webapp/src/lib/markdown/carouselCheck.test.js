import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carouselsInOneTab } from './carouselCheck.js';
import { renderMarkdownDoc } from './markdown.js';

const three = '`'.repeat(3);
const four = '`'.repeat(4);
const slide = '<!-- slide -->';
const code = (lang, text) => [three + lang, text, three, ''];
const carousel = (...slides) => [four + 'carousel', '', ...slides.flatMap((s, i) => (i ? [slide, '', ...s] : s)), four, ''].join('\n');

test('a carousel of several code blocks with no slide marker is one tab, and is found', () => {
  const md = ['# A lesson', '', carousel(code('go', 'a'), code('python', 'b'))].join('\n').replace(slide + '\n\n', '');
  assert.deepEqual(carouselsInOneTab(md), [3]);
});

test('with a slide marker between the blocks there is a tab for each, and nothing is found', () => {
  const md = ['# A lesson', '', carousel(code('go', 'a'), code('typescript', 'b'), code('python', 'c'))].join('\n');
  assert.deepEqual(carouselsInOneTab(md), []);
  const html = renderMarkdownDoc(md);
  assert.equal(html.split('class="tab-btn').length - 1, 3, 'and the page really has three tabs');
});

test('a carousel of one code block, and an example that shows a carousel inside a code block, are left alone', () => {
  assert.deepEqual(carouselsInOneTab(carousel(code('go', 'a'))), []);
  const shown = ['~~~markdown', four + 'carousel', ...code('go', 'a'), ...code('python', 'b'), four, '~~~', ''].join('\n');
  assert.deepEqual(carouselsInOneTab(shown), []);
});

test('only the carousel that needs a marker is named, by its own line', () => {
  const good = carousel(code('go', 'a'), code('python', 'b'));
  const bad = carousel(code('go', 'a'), code('python', 'b')).replace(slide + '\n\n', '');
  const md = ['intro', '', good, 'between', '', bad].join('\n');
  assert.deepEqual(carouselsInOneTab(md), [md.split('\n').findIndex((line, i) => line.startsWith(four + 'carousel') && i > 5) + 1]);
});
