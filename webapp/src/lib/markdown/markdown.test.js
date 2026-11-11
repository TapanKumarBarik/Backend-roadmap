import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNewlines, renderMarkdownDoc, splitTitle } from './markdown.js';

const lesson = '# Sessions\n\n> [!key] Never trust the client\n> The second line of the callout.\n\nA paragraph about cookies.\n';

test('a lesson renders the same whatever line endings it was saved with', () => {
  const html = renderMarkdownDoc(lesson);
  assert.equal(renderMarkdownDoc(lesson.replace(/\n/g, '\r\n')), html, 'Windows line endings');
  assert.equal(renderMarkdownDoc(lesson.replace(/\n/g, '\r')), html, 'old Mac line endings');
});

test('a callout becomes a block, not a quotation that prints its marker', () => {
  const html = renderMarkdownDoc(lesson.replace(/\n/g, '\r\n'));
  assert.match(html, /cblock cblock-key/);
  assert.doesNotMatch(html, /\[!key\]/);
});

test('the title is lifted out of the page body', () => {
  const { title, body } = splitTitle(renderMarkdownDoc(lesson));
  assert.equal(title, 'Sessions');
  assert.ok(!body.includes('<h1'));
});

test('every kind of line ending becomes a plain newline', () => {
  assert.equal(normalizeNewlines('a\r\nb\rc\nd'), 'a\nb\nc\nd');
});

test('an approximation sign is not a strikethrough', () => {
  // Older versions of the markdown library read "~evenly (~2,500 each)" as struck-out text; ten places in the lessons did.
  const html = renderMarkdownDoc('Hash-based spreads them ~evenly (~2,500 each), about ~8% and ~15% of samples.\n');
  assert.doesNotMatch(html, /<del>/);
  assert.match(html, /~evenly \(~2,500 each\)/);
});

test('two tildes still strike text through', () => {
  assert.match(renderMarkdownDoc('This is ~~wrong~~ right.\n'), /<del>wrong<\/del>/);
});

test('inline and display LaTeX math keep underscores intact without <em> mangling', () => {
  const md = [
    '$$\\text{Memory}_{\\text{HNSW}} = N \\cdot \\sum_{l=1}^{L_{\\text{max}}} P(l)$$',
    '',
    'For $N = 1{,}000{,}000$ and $D = 768$, cost is $O(N \\log N)$.'
  ].join('\n');
  const html = renderMarkdownDoc(md);
  assert.doesNotMatch(html, /<em>/);
  assert.match(html, /class="math-display"/);
  assert.match(html, /data-math-display="true"/);
  assert.match(html, /class="math-inline"/);
  assert.match(html, /\\text\{Memory\}_\{\\text\{HNSW\}\}/);
  assert.match(html, /\\sum_\{l=1\}/);
});

test('literal currency amounts and inline code variables are not treated as math', () => {
  const md = 'Scaling costs $1,000 to $500 per month, or `$HOME` / `$N` in bash, plus \\$99 flat.';
  const html = renderMarkdownDoc(md);
  assert.doesNotMatch(html, /data-math="/);
  assert.match(html, /\$1,000 to \$500/);
  assert.match(html, /<code>\$HOME<\/code>/);
  assert.match(html, /<code>\$N<\/code>/);
  assert.match(html, /\$99 flat/);
});

test('carousel code blocks become interactive language tabs with code highlighting', () => {
  const md = [
    '````carousel',
    '```go',
    'fmt.Println("hi")',
    '```',
    '<!-- slide -->',
    '### Python (`httpx`)',
    '```python',
    'print("hi")',
    '```',
    '````'
  ].join('\n');
  const html = renderMarkdownDoc(md);
  assert.doesNotMatch(html, /language-carousel/);
  assert.match(html, /<div class="tabs"/);
  assert.match(html, /data-lang="Go">Go<\/button>/);
  assert.match(html, /data-lang="Python">Python<\/button>/);
  assert.match(html, /language-go/);
  assert.match(html, /language-python/);
});

test('math inside callouts and duplicate-language carousel slides render cleanly', () => {
  const md = [
    '> [!TIP]',
    '> Subscript $a_1 + b_2$ stays intact inside callouts.',
    '',
    '````carousel',
    '```dockerfile',
    '# Dockerfile.go',
    'FROM golang:1.23',
    '```',
    '<!-- slide -->',
    '```dockerfile',
    '# Dockerfile.node',
    'FROM node:20',
    '```',
    '````'
  ].join('\n');
  const html = renderMarkdownDoc(md);
  assert.doesNotMatch(html, /<em>/);
  assert.match(html, /data-math="a_1 \+ b_2"/);
  assert.match(html, /data-lang="Dockerfile\.go"/);
  assert.match(html, /data-lang="Dockerfile\.node"/);
});
