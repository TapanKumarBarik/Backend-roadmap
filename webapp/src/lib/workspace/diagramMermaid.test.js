import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeLabel, toMermaid } from './diagramMermaid.js';
import { DIAGRAM_SHAPES } from './diagramShapes.js';

const node = (id, label, shape = 'rect') => ({ id, label, shape, x: 0, y: 0 });
const edge = (id, from, to, label = '', dashed = false) => ({ id, from, to, label, dashed });

test('an empty drawing is no text at all', () => {
  assert.equal(toMermaid({ nodes: [], edges: [] }), '');
});

test('every shape is written the way Mermaid draws it', () => {
  const model = { nodes: DIAGRAM_SHAPES.map((shape, i) => node(`a${i}`, `S${i}`, shape)), edges: [] };
  assert.equal(toMermaid(model), [
    'flowchart LR',
    '  n1["S0"]',
    '  n2("S1")',
    '  n3{"S2"}',
    '  n4[("S3")]',
    '  n5(("S4"))'
  ].join('\n'));
});

test('arrows are solid or dashed, with their words between bars when they have any', () => {
  const model = {
    nodes: [node('a', 'Client'), node('b', 'API')],
    edges: [edge('e1', 'a', 'b'), edge('e2', 'a', 'b', 'POST /login'), edge('e3', 'b', 'a', '', true), edge('e4', 'b', 'a', 'cached', true)]
  };
  assert.deepEqual(toMermaid(model).split('\n').slice(3), [
    '  n1 --> n2',
    '  n1 -->|"POST /login"| n2',
    '  n2 -.-> n1',
    '  n2 -.->|"cached"| n1'
  ]);
});

test('a drawing with a loop in it is written as it is: both arrows, and an arrow from a box to itself', () => {
  const model = { nodes: [node('a', 'A'), node('b', 'B')], edges: [edge('e1', 'a', 'b'), edge('e2', 'b', 'a'), edge('e3', 'a', 'a', 'retry')] };
  const lines = toMermaid(model).split('\n');
  assert.deepEqual(lines.slice(3), ['  n1 --> n2', '  n2 --> n1', '  n1 -->|"retry"| n1']);
});

test('the ids written are n1, n2, ... whatever the boxes are called, so no label or stored id can be a Mermaid keyword', () => {
  const model = { nodes: [node('end', 'end'), node('graph', 'subgraph'), node('o', 'o'), node('x', 'x')], edges: [edge('e1', 'end', 'o'), edge('e2', 'graph', 'x')] };
  const text = toMermaid(model);
  assert.match(text, /n1\["end"\]/);
  assert.doesNotMatch(text, /(^|\s)(end|graph|o|x)(\[| -->)/m);
  assert.match(text, /n1 --> n3/);
  assert.match(text, /n2 --> n4/);
});

test('words that Mermaid could read as syntax are written as entity codes inside quotes', () => {
  assert.equal(escapeLabel('say "hi"'), 'say #quot;hi#quot;');
  assert.equal(escapeLabel('a < b && c > d'), 'a #lt; b #amp;#amp; c #gt; d');
  assert.equal(escapeLabel('50% #1 `code` back\\slash'), '50#37; #35;1 #96;code#96; back#92;slash');
  assert.equal(escapeLabel('#quot;'), '#35;quot;', 'something that already looks like an entity is not read as one');
  assert.equal(escapeLabel('<img src=x onerror=alert(1)>'), '#lt;img src=x onerror=alert(1)#gt;');
  assert.equal(escapeLabel('one\ntwo\r\n\tthree'), 'one two three', 'a label is one line');
  assert.equal(escapeLabel('  spaced   out  '), 'spaced out');
  assert.equal(escapeLabel(null), '');
  assert.equal(escapeLabel('brackets [a] (b) {c} | ; : --'), 'brackets [a] (b) {c} | ; : --', 'these are safe inside quotes');
});

test('a hostile label cannot add a line, close its quotes or start a directive', () => {
  const evil = '"]\n  click n1 call alert(1)\n  n9["';
  const model = { nodes: [node('a', evil), node('b', 'B')], edges: [edge('e1', 'a', 'b', evil)] };
  const lines = toMermaid(model).split('\n');
  assert.equal(lines.length, 1 + 2 + 1, 'a header, two boxes and an arrow: nothing more');
  for (const line of lines.slice(1)) assert.match(line, /^ {2}n\d/);
  assert.equal((lines[1].match(/"/g) || []).length, 2, 'the quotes around the words are the only quotes');
  assert.equal((lines[3].match(/"/g) || []).length, 2);
  assert.doesNotMatch(toMermaid(model), /^ {2}click/m);
});

test('a box with no words is called Box, and an arrow to a box that is not there is left out', () => {
  const model = { nodes: [node('a', '   ')], edges: [edge('e1', 'a', 'missing'), edge('e2', 'missing', 'a')] };
  assert.equal(toMermaid(model), 'flowchart LR\n  n1["Box"]');
});

test('the same drawing always gives the same text', () => {
  const model = { nodes: [node('a', 'A', 'circle'), node('b', 'B', 'decision')], edges: [edge('e1', 'a', 'b', 'yes')] };
  assert.equal(toMermaid(model), toMermaid(structuredClone(model)));
});
