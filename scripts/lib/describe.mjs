// The one-sentence description a search result shows under a page's title, taken from the module's own text.
//
// A module's first paragraph is often a look back ("Module 06 gave you the HTTP caching contract...", "Track 04
// ended on a preview of it..."), which says nothing about the page it sits on, so paragraphs that open that way
// are passed over, and no two pages may end up with the same sentence (the capstone modules share their opening).

export const textOf = (html) => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').replace(/ ([,.;:!?)])/g, '$1').trim();

const MIN_LENGTH = 50;
const MAX_LENGTH = 160;

// "Module 06 gave you", "Track 04 ended", "By the end of track 02", "Where this sits.", "Prerequisites: ..." and the like.
const LOOKS_BACK = /^(?:(?:module|track|lesson|part)\s+\d+|by the end of (?:module|track)\s+\d+|where this sits|prerequisites?\b|before you (?:start|begin)|last (?:module|time)|in the previous|so far,|recap\b)/i;

// A look back is usually one sentence and the next one says what this page is about, so only the opening
// sentences that look back are dropped, not the whole paragraph.
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[A-Z"'“(])/;
function withoutLookBack(text) {
  const sentences = text.split(SENTENCE_BREAK);
  const first = sentences.findIndex((s) => !LOOKS_BACK.test(s));
  return first < 0 ? '' : sentences.slice(first).join(' ');
}

const snippet = (text) => (text.length <= MAX_LENGTH ? text : text.slice(0, MAX_LENGTH - 3).replace(/\s+\S*$/, '') + '…');

// Every paragraph of the page that would do, best first.
export function descriptionCandidates(html) {
  const found = [];
  for (const [, inner] of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
    const text = withoutLookBack(textOf(inner));
    if (text.length >= MIN_LENGTH) found.push(snippet(text));
  }
  return found;
}

// The first candidate no other page has taken, else the fallback. `taken` is the set of sentences already used.
export function pickDescription(candidates, taken, fallback) {
  const choice = candidates.find((c) => !taken.has(c));
  if (!choice) return fallback;
  taken.add(choice);
  return choice;
}
