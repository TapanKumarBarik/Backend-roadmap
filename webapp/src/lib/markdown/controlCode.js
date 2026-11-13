import { CONTROL_CODE } from '../../config/inlineCode.js';

const BACKSLASH = String.fromCharCode(92);

// A code span as marked writes it, with the <pre> that opens a fenced block in front when there is one. Text inside a span
// never holds "<" (marked escapes it), so everything up to the closing tag is the span's text.
const CODE = /(<pre[^>]*>\s*)?<code>([^<]*)<\/code>/g;

/** True when `text` is nothing but escape sequences: a backslash and one of the letters in config/inlineCode.js, over and over. */
export function isControlCode(text) {
  if (!text || text.length % 2 !== 0) return false;
  return [...text].every((char, i) => (i % 2 === 0 ? char === BACKSLASH : CONTROL_CODE.escapes.includes(char)));
}

/**
 * Gives every inline code span that is only escape sequences the class the styles draw as a quiet token. A fenced block is
 * `<pre><code>` and is left alone: in a block they are the code itself, laid out the way the author wrote them.
 */
export function markControlCode(html) {
  return html.replace(CODE, (whole, pre, text) => (!pre && isControlCode(text) ? `<code class="${CONTROL_CODE.className}">${text}</code>` : whole));
}
