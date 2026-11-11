// Lazy-loaded KaTeX renderer: kept out of the initial JS and CSS chunks so pages
// without formulas download 0 KB for math rendering, and fonts stay under `/assets/*`
// to satisfy `font-src 'self'` CSP in `_headers`.
import 'katex/dist/katex.min.css';
import katex from 'katex';

export function renderMathElements(root) {
  const nodes = [...root.querySelectorAll('[data-math]')];
  for (const el of nodes) {
    if (!el.isConnected || el.dataset.mathRendered) continue;
    const tex = el.dataset.math;
    if (!tex) continue;
    try {
      katex.render(tex, el, {
        displayMode: el.dataset.mathDisplay === 'true',
        throwOnError: false,
        strict: false,
        trust: false
      });
      el.dataset.mathRendered = '1';
    } catch {
      el.dataset.mathError = '1';
    }
  }
}

