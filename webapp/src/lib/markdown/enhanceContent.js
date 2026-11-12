import { slugify } from './markdown.js';
import { escapeHtml } from './escapeHtml.js';
import { isRunnable } from '../practice/runnable.js';

// The words on the buttons of a code block (the Run ones only on an example that can be run: lib/practice/runnable.js).
const BUTTONS = { copy: 'Copy', run: 'Run', edit: 'Edit', reset: 'Reset' };

// Colouring code is the one part of this pass that needs a large library, and it can arrive after the text without
// anyone noticing, so it is loaded on first use, as its own chunk (see highlighter.js), and applied when ready.
let highlighter = null;
function highlightLater(code, lang) {
  if (!highlighter) highlighter = import('./highlighter.js');
  // By the time it arrives the reader may have moved on to another module, whose code is not this node.
  highlighter.then((h) => { if (code.isConnected) h.highlight(code, lang); }).catch(() => { /* highlighting is optional */ });
}

let mathRenderer = null;
function renderMathLater(root) {
  if (!root.querySelector('[data-math]')) return;
  if (!mathRenderer) mathRenderer = import('./mathRender.js');
  mathRenderer.then((m) => { if (root.isConnected) m.renderMathElements(root); }).catch(() => { /* fallback text stays visible */ });
}

// Post-processes rendered markdown HTML in place: heading ids + permalink
// anchors, code-block wrapping/copy-bar/conditional highlighting. Pure DOM
// mutation only — no listeners attached here. Interactive bits (.anchor,
// .cb-copy, .tab-btn, internal links) are handled by a single delegated
// onClick on ArticleView's container, since the injected HTML persists
// across renders on the same container node just like the vanilla app kept
// one #content element and swapped its innerHTML.
export function enhanceContent(root, { runnable = false } = {}) {
  // marked() emits bare <img> tags with none of this — the browser would
  // otherwise fetch every image in a module up front, decode each
  // synchronously on the main thread, and block on whichever's slowest.
  // `loading="lazy"` only affects images the browser judges to be off-
  // screen at layout time, so this is free for anything already in view.
  root.querySelectorAll('img').forEach((img) => {
    if (!img.hasAttribute('loading')) img.loading = 'lazy';
    if (!img.hasAttribute('decoding')) img.decoding = 'async';
  });

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
    // querySelectorAll returns a static list, so a node captured here can
    // already be detached by the time we reach it — the browser's fixup of
    // malformed markup can nest one <pre> inside another, and wrapping the
    // outer one takes the inner with it. Reading .parentElement.classList
    // on a detached node threw, and the error boundary turned one bad code
    // block into a blank page for the whole module.
    if (!pre || !pre.parentElement) return;
    if (pre.parentElement.classList.contains('codeblock')) return;
    const wrap = document.createElement('div');
    wrap.className = 'codeblock';
    pre.replaceWith(wrap);
    wrap.appendChild(pre);

    const cls = [...code.classList].find((c) => c.startsWith('language-'));
    const lang = cls ? cls.replace('language-', '') : '';

    if (lang) highlightLater(code, lang);

    const bar = document.createElement('div');
    bar.className = 'cb-bar';
    // Only the site's own lessons run examples (`runnable`): an article by a reader is somebody else's code, and pressing Run would run it in the page's origin.
    const runs = runnable && isRunnable(lang, code.textContent)
      ? `<button class="cb-run" type="button">${BUTTONS.run}</button><button class="cb-edit" type="button" aria-pressed="false">${BUTTONS.edit}</button><button class="cb-reset" type="button" hidden>${BUTTONS.reset}</button>`
      : '';
    bar.innerHTML = `<span class="cb-lang">${escapeHtml(lang)}</span>${runs}<button class="cb-copy" type="button">${BUTTONS.copy}</button>`;
    wrap.appendChild(bar);
  });

  // After synchronous heading ID / TOC extraction so anchors never capture KaTeX's duplicate MathML text.
  renderMathLater(root);
}
