import { CONTROL_CODE } from '../../config/inlineCode.js';

const BACKSLASH = String.fromCharCode(92);

// A code span as marked writes it, with the <pre> that opens a fenced block in front when there is one. Text inside a span
// never holds "<" (marked escapes it), so everything up to the closing tag is the span's text.
const CODE = /(<pre[^>]*>\s*)?<code>([^<]*)<\/code>/g;

// A run of escape sequences that stands on its own in running text: not the start of a longer word (the "\new" in a Windows path), and not the second half of
// an escaped backslash.
const STANDALONE = new RegExp(String.raw`(?<!\\)(?:\\[${CONTROL_CODE.escapes}])+(?![A-Za-z0-9_])`, 'g');

/** True when `text` is nothing but escape sequences: a backslash and one of the letters in config/inlineCode.js, over and over. */
export function isControlCode(text) {
  if (!text || text.length % 2 !== 0) return false;
  return [...text].every((char, i) => (i % 2 === 0 ? char === BACKSLASH : CONTROL_CODE.escapes.includes(char)));
}

/**
 * `text` cut into [piece, isEscape] pairs, the escape sequences that stand on their own marked true, so a place that draws text itself (a plain code block, a diagram's
 * label, the page outline) can draw them in the control-code style. The pieces put back together are the text, unchanged.
 * @returns {Array<[string, boolean]>}
 */
export function splitControlText(text) {
  /** @type {Array<[string, boolean]>} */
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(STANDALONE)) {
    if (match.index > last) parts.push([text.slice(last, match.index), false]);
    parts.push([match[0], true]);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push([text.slice(last), false]);
  return parts;
}

/**
 * Gives every inline code span that is only escape sequences the class the styles draw as a quiet token. A fenced block is
 * `<pre><code>` and is left alone: in a block they are the code itself, laid out the way the author wrote them.
 */
export function markControlCode(html) {
  return html.replace(CODE, (whole, pre, text) => (!pre && isControlCode(text) ? `<code class="${CONTROL_CODE.className}">${text}</code>` : whole));
}
