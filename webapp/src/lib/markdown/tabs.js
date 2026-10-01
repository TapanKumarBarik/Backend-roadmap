import { marked } from 'marked';
import { escapeHtml } from './escapeHtml.js';
import { stash } from './htmlStash.js';

const OPEN = /^\s*\{\{tabs\}\}\s*$/;
const CLOSE = /^\s*\{\{\/tabs\}\}\s*$/;
const FENCE = /^(`{3,}|~{3,})/;

function buildGroup(body, gid) {
  const parts = body.split(/\{\{tab\s+([^}]+)\}\}/);
  let buttons = '';
  let panes = '';
  for (let i = 1; i < parts.length; i += 2) {
    const label = parts[i].trim();
    // Each pane is parsed on its own, before the rest of the document —
    // running the whole doc through marked first would let it mangle the
    // {{tabs}} syntax before this preprocessor ever saw it.
    const html = marked.parse((parts[i + 1] || '').trim());
    const first = i === 1;
    buttons += `<button class="tab-btn${first ? ' active' : ''}" data-lang="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
    panes += `<div class="tab-pane" data-lang="${escapeHtml(label)}" style="display:${first ? 'block' : 'none'}">${html}</div>`;
  }
  return `<div class="tabs" data-group="${gid}"><div class="tab-buttons">${buttons}</div><div class="tab-panes">${panes}</div></div>`;
}

// {{tabs}} {{tab Label}} …md… {{/tabs}}  ->  a tab group.
//
// A line scan rather than one regex over the whole document, for two
// reasons the regex version got wrong:
//
//  - A tab group's panes contain fenced code, so fences cannot simply be
//    skipped; but a fence *outside* a group must be, or a module that
//    documents this syntax has its own example rewritten. Two files did.
//  - The generated HTML is stashed, not spliced back into the markdown.
//    marked ends an HTML block at the first blank line, so a pane holding
//    a code sample with a blank line in it had its second half re-parsed
//    as markdown — mangling the code and leaving unbalanced tags. That
//    broke 22 of the 24 modules using tabs. See htmlStash.js.
export function renderTabs(md, store) {
  const lines = md.split('\n');
  const out = [];
  let fenceChar = null;
  let n = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!fenceChar && OPEN.test(line)) {
      const body = [];
      let j = i + 1;
      for (; j < lines.length && !CLOSE.test(lines[j]); j++) body.push(lines[j]);
      // Unterminated group: leave the source alone rather than swallowing
      // the rest of the document.
      if (j >= lines.length) { out.push(line); continue; }
      out.push(stash(store, buildGroup(body.join('\n'), 'tabgroup-' + n++)));
      i = j;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1][0];
      if (!fenceChar) fenceChar = marker;
      else if (fenceChar === marker) fenceChar = null;
    }
    out.push(line);
  }

  return out.join('\n');
}
