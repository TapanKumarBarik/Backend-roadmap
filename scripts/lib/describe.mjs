// The one-sentence description a search result shows under a page's title, taken from the module's own text.
//
// A module's key idea comes first when it has one (the `> [!key]` block is, by the module recipe, the one sentence the
// rest of the module follows from), then its paragraphs in order. A paragraph is often a look back ("Module 06 gave you
// the HTTP caching contract...", "In track 04 you learned..."), which says nothing about the page it sits on, so sentences
// that open that way are passed over, and no two pages may end up with the same description (the capstone modules share
// their opening). A description is whole sentences when they fit; it is cut at a word, with an ellipsis, only when the first
// sentence alone is too long.

import { SEO_LIMITS } from '../../webapp/src/lib/siteContent/seo.js';

export const textOf = (html) => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').replace(/ ([,.;:!?)\]])/g, '$1').replace(/([([]) /g, '$1').trim();

// The same range an editor's override must keep to (content/seo.json, webapp/src/lib/siteContent/seo.js).
const MIN_LENGTH = SEO_LIMITS.descriptionMin;
const MAX_LENGTH = SEO_LIMITS.descriptionMax;
// How many candidates are looked through for one that fits whole, before settling for the first one cut short.
const LOOKAHEAD = 4;

// The ways a sentence points back at the rest of the course instead of saying what this page is about.
const LOOKS_BACK = new RegExp(`^(?:${[
  '(?:module|track|lesson|part)\\s+\\d+', // "Module 06 gave you", "Track 04 ended"
  'by the end of (?:module|track)\\s+\\d+',
  'in (?:module|track|lesson)s?\\s+\\d+', // "In module 00 you traced", "In track 6 module 05 you enabled"
  'in the (?:last|previous|earlier)\\b',
  'you are (?:now )?(?:in|on|at) (?:module|track|lesson)', // "You are in Track 05, GPUs & GenAI Hardware."
  'this is the (?:first|second|third|last|final|next) (?:module|lesson) of\\b',
  'you already (?:know|met|saw|have|built|learned)',
  'where this sits',
  'prerequisites?\\b',
  'before you (?:start|begin)',
  'last (?:module|time)',
  'so far\\b',
  'earlier (?:modules|tracks|lessons)\\b',
  'this (?:module|track) picks up',
  'recap\\b'
].join('|')})`, 'i');

// "🎯 Goal: Install, update..." and "TL;DR: ...": the emoji and the label are formatting; the sentence after them is the description.
const LEADING_LABEL = /^[\p{Extended_Pictographic}️‍\s]*(?:(?:goal|in short|tl;?dr)\s*:\s*)?/iu;

// A look back is usually one sentence and the next one says what this page is about, so only the opening
// sentences that look back are dropped, not the whole paragraph.
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[A-Z"'“(])/;
function withoutLookBack(text) {
  const sentences = text.split(SENTENCE_BREAK);
  const first = sentences.findIndex((s) => !LOOKS_BACK.test(s));
  return first < 0 ? '' : sentences.slice(first).join(' ');
}

const cut = (text) => text.slice(0, MAX_LENGTH - 3).replace(/\s+\S*$/, '') + '…';

// As many whole sentences as fit; the text cut at a word only when its first sentence alone is too long (or too short to
// say anything). A closing sentence that ends in a colon introduces a list that is not in the description, so it is left out.
export function snippet(text) {
  const sentences = text.split(SENTENCE_BREAK);
  while (sentences.length > 1 && sentences.at(-1).endsWith(':')) sentences.pop();
  const all = sentences.join(' ');
  if (all.length <= MAX_LENGTH) return all;
  let whole = '';
  for (const sentence of sentences) {
    const next = whole ? `${whole} ${sentence}` : sentence;
    if (next.length > MAX_LENGTH) break;
    whole = next;
  }
  return whole.length >= MIN_LENGTH ? whole : cut(all);
}

const paragraphsOf = (html) => [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => textOf(m[1]));
const KEY_BLOCK = /<div class="cblock cblock-key">[\s\S]*?<div class="cblock-b">([\s\S]*?)<\/div><\/div>/g;

// Every paragraph of the page that would do, best first: the key idea, then the text in order.
export function descriptionCandidates(html) {
  const keyIdeas = [...html.matchAll(KEY_BLOCK)].flatMap((m) => paragraphsOf(m[1]));
  const found = [];
  for (const paragraph of [...keyIdeas, ...paragraphsOf(html)]) {
    const text = withoutLookBack(paragraph.replace(LEADING_LABEL, ''));
    if (text.length < MIN_LENGTH) continue;
    const candidate = snippet(text);
    if (candidate.length < MIN_LENGTH || candidate.endsWith(':') || found.includes(candidate)) continue;
    found.push(candidate);
  }
  return found;
}

// What a video says about itself (its description's first paragraph), for a page that is that video and little else.
export const videoCandidates = (videos) => videos.map((v) => v.summary).filter(Boolean).map((summary) => snippet(summary));

// The first candidate no other page has taken that fits whole, else the first one that is free, else the fallback.
// `taken` is the set of descriptions already used. Start it with the descriptions an editor wrote by hand
// (descriptionsTaken in webapp/src/lib/siteContent/seo.js): an override counts as taken, so no generated one repeats it.
export function pickDescription(candidates, taken, fallback) {
  const free = candidates.filter((c) => !taken.has(c));
  const choice = free.slice(0, LOOKAHEAD).find((c) => !c.endsWith('…')) || free[0];
  if (!choice) return fallback;
  taken.add(choice);
  return choice;
}
