import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isControlCode, markControlCode } from './controlCode.js';
import { renderMarkdownDoc } from './markdown.js';
import { CONTROL_CODE } from '../../config/inlineCode.js';

const raw = String.raw;
const crlf = raw`\r\n`;
const headerEnd = raw`\r\n\r\n`;
const marked = (text) => `<code class="${CONTROL_CODE.className}">${text}</code>`;

test('text made only of escape sequences is control code', () => {
  for (const text of [crlf, headerEnd, raw`\n`, raw`\n\n`, raw`\r`, raw`\t`, raw`\0`]) assert.equal(isControlCode(text), true, text);
});

test('anything else is ordinary code', () => {
  for (const text of ['', 'Content-Length', 'GET / HTTP/1.1' + crlf, crlf + ' ', raw`\x`, raw`\q`, raw`r\n`, raw`\\`, '502']) assert.equal(isControlCode(text), false, JSON.stringify(text));
});

test('an inline span of escape sequences gets the class and its text is untouched', () => {
  const html = `<p>CRLF (<code>${crlf}</code>) and (<code>${headerEnd}</code>)</p>`;
  assert.equal(markControlCode(html), `<p>CRLF (${marked(crlf)}) and (${marked(headerEnd)})</p>`);
});

test('a span with anything else in it, and a fenced block, are left as they were', () => {
  const html = `<p><code>Content-Length</code> <code>GET / HTTP/1.1${crlf}</code></p><pre><code>${crlf}</code></pre><pre class="x">  <code>${raw`\n`}</code></pre>`;
  assert.equal(markControlCode(html), html);
});

test('a lesson shows it in a callout and in a list, and the page text still says what the author wrote', () => {
  const md = [
    '> [!tip]',
    '> Lines end in CRLF (`' + crlf + '`) and the header ends at (`' + headerEnd + '`).',
    '',
    '* a missing `' + headerEnd + '` boundary',
    '',
    '```text',
    'GET / HTTP/1.1' + crlf,
    '```',
    ''
  ].join('\n');
  const html = renderMarkdownDoc(md);
  assert.equal(html.split(`class="${CONTROL_CODE.className}"`).length - 1, 3, 'the callout has two, the list one');
  assert.ok(html.includes(marked(crlf)) && html.includes(marked(headerEnd)), 'the text is the same characters');
  assert.doesNotMatch(html, /<pre[^>]*><code[^>]*class="code-control"/, 'the fenced block is not one');
});
