// The picture a link to a page shows on LinkedIn, X, Slack and the like (og:image): one card per page, drawn at build time
// by scripts/build/gen-share-images.mjs and named in the page by scripts/build/prerender.mjs. This file is what can be
// tested without drawing anything: where a card is kept, what it says, and how large its title is set.
import { LIBRARY } from '../../webapp/src/config/landing.js';
import { shortTitle } from '../../webapp/src/lib/curriculum/curriculumPosition.js';
import { topicOf } from '../../webapp/src/lib/curriculum/pageTitle.js';

// The words on a card that are not a page's own title. (A card's pieces: the site's name and a badge across the top, a small
// line above the title saying where the page sits, the title, the address, and one label bottom right.)
export const CARD_COPY = {
  curriculum: 'Curriculum',
  video: 'Video lesson',
  soon: 'Coming soon',
  minutes: (n) => `${n} min read`,
  modules: (n) => `${n} ${n === 1 ? 'module' : 'modules'}`
};

// Where a page's card is kept in dist/, and the address it is served at. A page's address is its path ("/backend/01-x/"),
// which may be percent-encoded; the file on disk is not.
const trimSlashes = (url) => url.replace(/^\/|\/$/g, '');
export const shareImagePath = (dir, url) => `${dir}/${decodeURIComponent(trimSlashes(url))}.png`;
export const shareImageUrl = (site, dir, url) => `${site}/${dir}/${trimSlashes(url)}.png`;

// A curriculum goes by the name the landing page gives it ("Linux to Cloud"), not the first words of its README's title ("Learn").
const curriculumName = (root) => LIBRARY.items.find((item) => item.id === root.path)?.title ?? shortTitle(root);

/**
 * What a page's card says.
 * @param {object} input
 * @param {any} input.node        the page's node in docs-index.json
 * @param {any[]} input.ancestors the pages above it, the curriculum first
 * @param {any[]} [input.clips]   the videos attached to it
 * @returns {{ title: string, kicker: string, badge: string | null, pill: string }}
 */
export function cardFor({ node, ancestors, clips = [] }) {
  const root = ancestors[0];
  const modules = (node.children || []).filter((c) => c.file).length;
  if (!root) {
    return { title: curriculumName(node), kicker: CARD_COPY.curriculum, badge: null, pill: `${modules} ${LIBRARY.unit(node.path, modules)}` };
  }
  const rootName = curriculumName(root);
  if (node.children && node.children.length) {
    return { title: topicOf(node), kicker: rootName, badge: null, pill: CARD_COPY.modules(modules) };
  }
  const parent = ancestors.at(-1);
  const place = parent === root ? rootName : topicOf(parent);
  const pill = clips.length ? CARD_COPY.video : node.min != null ? CARD_COPY.minutes(node.min) : CARD_COPY.soon;
  return { title: topicOf(node), kicker: place, badge: place === rootName ? null : rootName, pill };
}

// The title is set as large as fits in the room the card gives it: the width of the text column, and as tall as three
// lines of the middle size. Sizes are tried from the largest down; a title that does not fit even at the smallest is cut at a word.
const TITLE_WIDTH = 1040;
const TITLE_MAX_HEIGHT = 250;
const TITLE_SIZES = [88, 76, 66, 58, 50];
const GLYPH_WIDTH = 0.62; // an average character of the bold face, as a fraction of its size (a little generous, so a wrap never overflows)
const LINE_HEIGHT = 1.1;

const linesAt = (text, size) => Math.ceil(text.length / Math.floor(TITLE_WIDTH / (GLYPH_WIDTH * size)));

export function fitTitle(title) {
  for (const size of TITLE_SIZES) {
    if (linesAt(title, size) * size * LINE_HEIGHT <= TITLE_MAX_HEIGHT) return { size, text: title, lineHeight: LINE_HEIGHT };
  }
  const size = TITLE_SIZES.at(-1);
  const room = Math.floor(TITLE_WIDTH / (GLYPH_WIDTH * size)) * Math.floor(TITLE_MAX_HEIGHT / (size * LINE_HEIGHT));
  return { size, text: title.slice(0, room - 1).replace(/\s+\S*$/, '') + '…', lineHeight: LINE_HEIGHT };
}

// The face the cards are set in covers Latin text and common punctuation; anything else would be drawn as an empty box.
// A few common symbols become their plain words, and whatever is left over is dropped. (The ranges are code points, not
// characters typed in, so no invisible character can hide in this file: printable ASCII; Latin-1 with the no-break space;
// the dashes, quotation marks, bullet and ellipsis of general punctuation; the trade mark sign.)
const DRAWN = [[0x20, 0x7e], [0xa0, 0xff], [0x2010, 0x2015], [0x2018, 0x201f], [0x2022, 0x2022], [0x2026, 0x2026], [0x2122, 0x2122]];
const UNSUPPORTED = new RegExp(`[^${DRAWN.map(([from, to]) => `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`).join('')}]`, 'gu');
const SYMBOLS = { '→': 'to', '⇒': 'to', '≥': '>=', '≤': '<=' };
export const printable = (text) => text
  .replace(/[→⇒≥≤]/gu, (c) => ` ${SYMBOLS[c]} `)
  .replace(UNSUPPORTED, '')
  .replace(/\s+/g, ' ')
  .trim();

// The mark of the logo, in the colours of the dark card (the same drawing as webapp/public/favicon.svg).
export const logoSvg = ({ tile, ink, dot }) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="56" height="56">'
  + `<rect width="24" height="24" rx="5.5" fill="${tile}"/>`
  + `<circle cx="7" cy="17.6" r="1.9" fill="none" stroke="${ink}" stroke-width="1.7"/>`
  + `<path d="M7 15.7V13.8Q7 11.3 9.5 11.3H14.5Q17 11.3 17 8.8V8.4" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  + `<circle cx="17" cy="6.3" r="2.5" fill="${dot}"/></svg>`;

/** "#e9a053", 0.2 -> "rgba(233, 160, 83, 0.2)" */
export function withAlpha(hex, alpha) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
