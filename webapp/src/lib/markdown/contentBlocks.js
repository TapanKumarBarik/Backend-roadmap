import { marked } from 'marked';
import { stash } from './htmlStash.js';

// Structured content blocks.
//
// Technical prose here is well typeset but structurally flat: a definition,
// a worked example and a warning all render as identical paragraphs, so a
// reader has nothing to navigate by and skimming a 2,700-word module tells
// you nothing about what's in it.
//
// The syntax is GitHub's alert syntax, extended. That choice is deliberate:
// these files are read on GitHub as well as in this app, and GitHub renders
// `> [!NOTE]` natively and degrades every unknown type to a plain
// blockquote. So a module using these still reads correctly in the repo,
// and a module using none of them renders exactly as it always has.
//
//   > [!key] Never make a user wait for work that doesn't have to happen
//   > inside their request.
//
//   > [!check]
//   > - Explain why a queue is not a thread pool
//   > - Describe what happens when a worker dies mid-job

// The seven that carry the curriculum's own teaching structure. These are
// what the editor offers, and the order is the order they tend to appear
// in a module: state the idea, show it, model it, warn about it, then
// practise and check.
const AUTHORED = [
  ['key', 'Key idea', 'key'],
  ['example', 'Example', 'example'],
  ['model', 'Mental model', 'model'],
  ['pitfall', 'Pitfall', 'pitfall'],
  ['interview', 'Interview', 'interview'],
  ['exercise', 'Exercise', 'exercise'],
  ['check', 'Check your understanding', 'check']
];

const BLOCKS = Object.fromEntries(AUTHORED.map(([k, label, cls]) => [k, { label, cls }]));

// GitHub's five native alert types render too, so content written for the
// repo's own reader keeps its meaning here instead of printing a literal
// "[!NOTE]" into the page. Not offered in the editor — they overlap with
// the seven above, and two ways to say "pitfall" is one too many.
Object.assign(BLOCKS, {
  note: { label: 'Note', cls: 'note' },
  tip: { label: 'Tip', cls: 'tip' },
  important: { label: 'Important', cls: 'key' },
  warning: { label: 'Warning', cls: 'pitfall' },
  caution: { label: 'Caution', cls: 'pitfall' }
});

export const BLOCK_TYPES = AUTHORED.map(([key, label]) => ({ key, label }));

const OPENER = /^>[ \t]*\[!([A-Za-z]+)\][ \t]*(.*)$/;
// Deliberately column-zero only, and the closing marker must match the
// opening one. An earlier version allowed leading whitespace, which
// counted an indented closing fence whose opener sat inside a list item
// ("1. ```") — an odd number of matches left every line after it treated
// as code, silently dropping the blocks further down the file.
//
// Column-zero is not a shortcut here, it's the correct scope: OPENER also
// requires ">" at column zero, so an indented fence can never contain a
// line this function would transform.
const FENCE = /^(`{3,}|~{3,})/;

// Runs before marked sees the document (same stage as renderTabs) so it
// reads clean markdown rather than trying to unpick marked's blockquote
// output. The rendered block is stashed rather than spliced in — a block
// containing a code sample with a blank line would otherwise be cut in
// half by marked, exactly as tab panes were. See htmlStash.js.
export function renderBlocks(md, store) {
  const lines = md.split('\n');
  const out = [];
  let fenceChar = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Never transform inside a fenced code block — a module explaining
    // this very syntax would otherwise have its example eaten.
    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1][0];
      if (!fenceChar) fenceChar = marker;
      else if (fenceChar === marker) fenceChar = null;
    }
    if (fenceChar) { out.push(line); continue; }

    const m = line.match(OPENER);
    const spec = m && BLOCKS[m[1].toLowerCase()];
    if (!spec) { out.push(line); continue; }

    // Collect the rest of the blockquote, stripping one level of "> ".
    const body = [];
    if (m[2].trim()) body.push(m[2]);
    let j = i + 1;
    for (; j < lines.length && /^>/.test(lines[j]); j++) {
      body.push(lines[j].replace(/^>[ \t]?/, ''));
    }
    i = j - 1;

    const inner = marked.parse(body.join('\n').trim());
    out.push(stash(
      store,
      `<div class="cblock cblock-${spec.cls}">`
      + `<div class="cblock-h">${spec.label}</div>`
      + `<div class="cblock-b">${inner}</div>`
      + '</div>'
    ));
  }

  return out.join('\n');
}
