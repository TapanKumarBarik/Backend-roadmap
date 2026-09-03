import { marked } from 'marked';
import { escapeHtml } from './escapeHtml.js';

// {{tabs}} {{tab Label}} …md… {{/tabs}}  ->  raw HTML block, ported verbatim.
// Order matters: each pane is parsed through marked.parse INDIVIDUALLY here,
// and the resulting raw HTML is spliced back into the markdown string before
// the *rest* of the document is run through marked.parse (in markdown.js) —
// running the whole doc through marked first would let it mangle the
// {{tabs}} syntax before this preprocessor ever saw it.
export function renderTabs(md) {
  let n = 0;
  return md.replace(/\{\{tabs\}\}([\s\S]*?)\{\{\/tabs\}\}/g, (m, body) => {
    const gid = 'tabgroup-' + (n++);
    const parts = body.split(/\{\{tab\s+([^}]+)\}\}/);
    let buttons = '', panes = '';
    for (let i = 1; i < parts.length; i += 2) {
      const label = parts[i].trim();
      const html = marked.parse((parts[i + 1] || '').trim());
      const first = i === 1;
      buttons += `<button class="tab-btn${first ? ' active' : ''}" data-lang="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
      panes += `<div class="tab-pane" data-lang="${escapeHtml(label)}" style="display:${first ? 'block' : 'none'}">${html}</div>`;
    }
    return `<div class="tabs" data-group="${gid}"><div class="tab-buttons">${buttons}</div><div class="tab-panes">${panes}</div></div>`;
  });
}
