import { marked } from 'marked';
import { escapeHtml } from './escapeHtml.js';

// Protects LaTeX math ($...$, $$...$$, \(...\), \[...\]) from CommonMark emphasis
// parsing before `marked` runs: `_` inside formulas (e.g. \text{A}_{\text{B}} ...
// \sum_{i=1}) would otherwise turn into <em> tags and lose its underscores.
// Loaded in plain Node by scripts/build/prerender.mjs, so keep this pure JS with
// zero CSS imports; KaTeX itself loads lazily in mathRender.js in the browser.

const CODE_SPAN = /(?<!`)(`+)(?!`).+?(?<!`)\1(?!`)|([^`]+|`+)/g;
const INLINE_MATH = /(?<!\\)(?<!\$)\$(?!\$)(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)(?<!\\)\$(?!\$)(?![0-9])/g;
const DISPLAY_INLINE = /(?<!\\)\$\$((?:\\.|[^$\\]|\$(?!\$))+?)(?<!\\)\$\$/g;
const PAREN_MATH = /\\\[((?:\\.|[^\n\]\\]|\\[^\]])+?)\\\]|\\\(((?:\\.|[^\n)\\]|\\[^)])+?)\\\)/g;

/** Advances fenced-code state (`state.char`, `state.len`); returns true if `line` is fence syntax or inside one. */
export function stepFence(line, state) {
  if (state.char) {
    if (new RegExp(`^ {0,3}${state.char}{${state.len},}\\s*$`).test(line)) state.char = '';
    return true;
  }
  const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  // CommonMark: backtick fence info strings cannot contain another backtick (e.g. `` `foo` ``).
  if (m && (m[1][0] !== '`' || !m[2].includes('`'))) {
    state.char = m[1][0];
    state.len = m[1].length;
    return true;
  }
  return false;
}

function stashMathOutsideCode(md, store) {
  const push = (tex, display) => {
    const clean = tex.trim();
    if (!clean) return '';
    const idx = store.length;
    const attr = display ? ' data-math-display="true"' : '';
    const fallback = clean.replace(/\\(?:text|mathrm|mathbf)\{([^}]*)\}/g, '$1').replace(/[{}]/g, '');
    store.push(`<span class="math-${display ? 'display' : 'inline'}" data-math="${escapeHtml(clean)}"${attr}>${escapeHtml(fallback)}</span>`);
    return `\uE000MSLOT${idx}\uE001`;
  };

  const replaceInline = (seg) => seg
    .replace(DISPLAY_INLINE, (m, t) => push(t, true) || m)
    .replace(PAREN_MATH, (m, d, i) => push(d ?? i, d != null) || m)
    .replace(INLINE_MATH, (m, t) => push(t, false) || m);

  const lines = md.split('\n');
  const out = [];
  const fence = { char: '', len: 0 };
  let disp = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (disp) {
      if (/^\s*\$\$\s*$/.test(line)) {
        out.push(push(disp.join('\n'), true));
        disp = null;
      } else {
        disp.push(line);
      }
      continue;
    }
    if (stepFence(line, fence)) {
      out.push(line);
      continue;
    }
    if (/^\s*\$\$\s*$/.test(line) && lines.some((l, j) => j > i && /^\s*\$\$\s*$/.test(l))) {
      disp = [];
      continue;
    }
    out.push(line.replace(CODE_SPAN, (m, code) => (code ? m : replaceInline(m))));
  }

  return out.join('\n');
}

function restoreMath(html, store) {
  return store.length ? html.replace(/\uE000MSLOT(\d+)\uE001/g, (m, i) => store[Number(i)] ?? m) : html;
}

/** Parses block Markdown with math delimiters protected from CommonMark emphasis rules. */
export function parseMarkdown(md) {
  const store = [];
  return restoreMath(/** @type {string} */ (marked.parse(stashMathOutsideCode(md || '', store))), store);
}

/** Parses inline Markdown with inline math delimiters protected from CommonMark emphasis rules. */
export function parseInlineMarkdown(md) {
  const store = [];
  return restoreMath(/** @type {string} */ (marked.parseInline(stashMathOutsideCode(md || '', store))), store);
}
