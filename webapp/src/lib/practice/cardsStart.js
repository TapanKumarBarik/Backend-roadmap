// How a lesson's Flash cards button asks for an interview set to open as cards (components/article/FinishCheck.jsx leaves the mark, components/practice/InterviewView.jsx
// reads it). Its own file because the lesson page needs this and not the rest of lib/practice/cards.js, which is then only downloaded with the deck.

/** The mark a lesson leaves so that a set opens as cards: the set's name and the moment, as "slug|ms" (the moment is what lets it lapse without anything clearing it). */
export const cardsStartMark = (slug, now) => `${slug}|${now}`;

/** Whether `mark` (what is stored) asks for the set `slug` to open as cards at `now`: it names that set and is less than `windowMs` old. */
export function cardsStartWanted(mark, slug, now, windowMs) {
  if (typeof mark !== 'string') return false;
  const at = mark.lastIndexOf('|');
  if (at < 1 || mark.slice(0, at) !== slug) return false;
  const when = Number(mark.slice(at + 1));
  return Number.isFinite(when) && now - when >= 0 && now - when < windowMs;
}
