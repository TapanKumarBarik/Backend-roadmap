import test from 'node:test';
import assert from 'node:assert/strict';
import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import { hljsRanges } from './hljsRanges.js';

test('the coloured parts are found by their place in the plain text', () => {
  const html = '<span class="hljs-keyword">def</span> <span class="hljs-title function_">charge</span>(key):';
  assert.deepEqual(hljsRanges(html), [
    { from: 0, to: 3, cls: 'hljs-keyword' },
    { from: 4, to: 10, cls: 'hljs-title function_' }
  ]);
});

test('entities count as the one character they stand for', () => {
  const html = 'a &lt; b &amp;&amp; <span class="hljs-string">&quot;x&quot;</span> &#x27;&#39;';
  const plain = 'a < b && "x" \'\'';
  const [range] = hljsRanges(html);
  assert.equal(plain.slice(range.from, range.to), '"x"');
});

test('a part inside another is listed first, and an empty part is left out', () => {
  const html = '<span class="a">x<span class="b">y</span>z</span><span class="c"></span>';
  assert.deepEqual(hljsRanges(html), [{ from: 1, to: 2, cls: 'b' }, { from: 0, to: 3, cls: 'a' }]);
});

test('what highlight.js really writes lines up with the code it was given', () => {
  hljs.registerLanguage('python', python);
  const code = 'def charge(key, amount):\n    done = store.get(key)  # a "retry" <b>\n    return done\n';
  const html = hljs.highlight(code, { language: 'python', ignoreIllegals: true }).value;
  const ranges = hljsRanges(html);
  assert.ok(ranges.length >= 4, `${ranges.length} coloured parts`);
  const text = (range) => code.slice(range.from, range.to);
  assert.ok(ranges.some((r) => r.cls.includes('hljs-keyword') && text(r) === 'def'), 'def is a keyword');
  assert.ok(ranges.some((r) => r.cls.includes('hljs-keyword') && text(r) === 'return'), 'return is a keyword');
  assert.ok(ranges.some((r) => r.cls.includes('hljs-comment') && text(r).startsWith('# a "retry" <b>')), 'the comment, with its quotes and brackets, is one part');
  for (const range of ranges) assert.ok(range.from >= 0 && range.to <= code.length && range.from < range.to);
});
