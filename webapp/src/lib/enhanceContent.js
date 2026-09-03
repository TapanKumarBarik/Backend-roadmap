import hljs from 'highlight.js';
import { slugify } from './markdown.js';
import { escapeHtml } from './escapeHtml.js';

// Post-processes rendered markdown HTML in place: heading ids + permalink
// anchors, code-block wrapping/copy-bar/conditional highlighting. Pure DOM
// mutation only — no listeners attached here. Interactive bits (.anchor,
// .cb-copy, .tab-btn, internal links) are handled by a single delegated
// onClick on ArticleView's container, since the injected HTML persists
// across renders on the same container node just like the vanilla app kept
// one #content element and swapped its innerHTML.
export function enhanceContent(root) {
  const used = {};
  root.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
    let id = slugify(h.textContent);
    if (!id) id = 'section';
    if (used[id] !== undefined) { used[id]++; id = id + '-' + used[id]; } else used[id] = 0;
    h.id = id;
    const a = document.createElement('a');
    a.className = 'anchor';
    a.href = '#' + id;
    a.textContent = '#';
    a.dataset.headingAnchor = id;
    h.prepend(a);
  });

  root.querySelectorAll('pre > code').forEach((code) => {
    const pre = code.parentElement;
    if (pre.parentElement.classList.contains('codeblock')) return;
    const wrap = document.createElement('div');
    wrap.className = 'codeblock';
    pre.replaceWith(wrap);
    wrap.appendChild(pre);

    const cls = [...code.classList].find((c) => c.startsWith('language-'));
    const lang = cls ? cls.replace('language-', '') : '';

    // Only highlight when an explicit, known language is declared. Bare
    // fences in this curriculum are usually ASCII diagrams/tables — auto
    // detection mangles those.
    if (lang && hljs.getLanguage(lang)) {
      try { hljs.highlightElement(code); } catch { /* highlighting is optional */ }
    }

    const bar = document.createElement('div');
    bar.className = 'cb-bar';
    bar.innerHTML = `<span class="cb-lang">${escapeHtml(lang)}</span><button class="cb-copy" type="button">Copy</button>`;
    wrap.appendChild(bar);
  });
}
