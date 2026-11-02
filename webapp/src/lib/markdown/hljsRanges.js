// highlight.js writes coloured code as HTML: the text, with <span class="hljs-keyword">...</span> around the parts that
// have a meaning. A place that draws its own text (the studio's editor, where the text is the document and the colours
// are decorations over it) needs the same thing as ranges: where each coloured part starts and ends in the plain text.
// This reads the one from the other. Pure, so it is tested without highlight.js.

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };
const decode = (text) => text.replace(/&(?:lt|gt|amp|quot|#x27|#39);/g, (entity) => ENTITIES[entity]);

/**
 * The coloured parts of a highlight.js result: [{ from, to, cls }], offsets into the plain text (UTF-16 units, as an editor
 * counts them), in the order their ends are reached; a part inside another comes before it.
 * @param {string} html
 * @returns {{ from: number, to: number, cls: string }[]}
 */
export function hljsRanges(html) {
  /** @type {{ from: number, to: number, cls: string }[]} */
  const ranges = [];
  /** @type {{ cls: string, from: number }[]} */
  const open = [];
  let offset = 0;
  for (const [piece, cls, text] of html.matchAll(/<span class="([^"]*)">|<\/span>|([^<]+)/g)) {
    if (cls !== undefined) {
      open.push({ cls, from: offset });
    } else if (piece === '</span>') {
      const part = open.pop();
      if (part && offset > part.from) ranges.push({ from: part.from, to: offset, cls: part.cls });
    } else if (text !== undefined) {
      offset += decode(text).length;
    }
  }
  return ranges;
}
