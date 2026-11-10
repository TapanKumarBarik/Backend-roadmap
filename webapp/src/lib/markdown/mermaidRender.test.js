import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeSemicolons, quoteEdgeLabels, prepareSource } from './mermaidRender.js';

test('a semicolon inside a sequence-diagram message or note is written as mermaid\'s entity', () => {
  const out = escapeSemicolons('sequenceDiagram\n  A->>B: Accept: text/csv;q=0.5<br/>Content-Type: json; charset=utf-8\n  Note over B: gzip_types *; (all)');
  assert.equal(out, 'sequenceDiagram\n  A->>B: Accept: text/csv#59;q=0.5<br/>Content-Type: json#59; charset=utf-8\n  Note over B: gzip_types *#59; (all)');
});

test('a single closing semicolon is still a terminator, and lines without a colon are untouched', () => {
  const out = escapeSemicolons('sequenceDiagram\n  participant A;\n  A->>B: hello;');
  assert.equal(out, 'sequenceDiagram\n  participant A;\n  A->>B: hello;');
});

test('other kinds of diagram are not changed: there a semicolon separates statements', () => {
  const flow = 'flowchart LR\n  A[start]-->B: x; C-->D';
  assert.equal(escapeSemicolons(flow), flow);
});

test('a comment line before the diagram type does not hide it', () => {
  assert.match(escapeSemicolons('%% note\nsequenceDiagram\n  A->>B: a;b'), /a#59;b/);
});

test('a flowchart edge label holding brackets or braces is quoted; plain, quoted and piped labels are left alone', () => {
  assert.equal(quoteEdgeLabels('flowchart LR\n  A -->|Write Fast (<1ms)| B\n  A -.->|{id, user}| C'),
    'flowchart LR\n  A -->|"Write Fast (<1ms)"| B\n  A -.->|"{id, user}"| C');
  const same = 'graph TD\n  A -->|plain label| B\n  A -->|"already (quoted)"| C\n  N[node (x)] --> M';
  assert.equal(quoteEdgeLabels(same), same);
  const sequence = 'sequenceDiagram\n  A->>B: x -->|y (z)| w';
  assert.equal(quoteEdgeLabels(sequence), sequence);
});

test('prepareSource applies both repairs', () => {
  assert.equal(prepareSource('sequenceDiagram\n  A->>B: a;b'), 'sequenceDiagram\n  A->>B: a#59;b');
  assert.equal(prepareSource('flowchart LR\n  A -->|f (x)| B'), 'flowchart LR\n  A -->|"f (x)"| B');
});
