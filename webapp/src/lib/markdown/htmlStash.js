// Holds pre-rendered HTML out of marked's way, and puts it back afterwards.
//
// Anything that generates HTML *before* the document is parsed — tab groups,
// content blocks — cannot simply splice that HTML into the markdown. marked
// ends an HTML block at the first blank line, and pre-rendered HTML is full
// of them: any fenced code sample with a blank line in it, for a start. When
// the block ends early, the remainder of the generated HTML gets re-parsed as
// markdown, which mangles the content (a Python `__init__` becomes
// <strong>init</strong>) and leaves unbalanced tags that the browser then
// "fixes" into nesting nobody intended.
//
// So each generated fragment is swapped for a one-line placeholder — no blank
// lines, nothing for marked to trip over — and restored once parsing is done.

const SLOT = /<div data-html-slot="(\d+)"><\/div>/g;

export function createStash() {
  return [];
}

// Returns the placeholder to leave in the markdown in place of `html`.
// Blank lines around it keep it a block-level HTML element rather than
// something marked wraps in a <p>.
export function stash(store, html) {
  store.push(html);
  return `\n\n<div data-html-slot="${store.length - 1}"></div>\n\n`;
}

export function restore(renderedHtml, store) {
  if (!store.length) return renderedHtml;
  return renderedHtml.replace(SLOT, (match, i) => {
    const html = store[Number(i)];
    return html === undefined ? match : html;
  });
}
