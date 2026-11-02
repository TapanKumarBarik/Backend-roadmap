// How an article's facts are written down for a reader. Pure, and fixed to UTC, so the date in the page the server
// draws is the date the app draws.

const DATE = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

/** "2026-11-02T10:00:00.000Z" -> "Nov 2, 2026"; an empty string for anything that is not a date. */
export function formatDate(iso) {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? DATE.format(time) : '';
}

/** "5 min read" */
export const readingTime = (minutes) => `${Math.max(1, Math.round(minutes) || 1)} min read`;

/** A count with its noun, "1 like", "12 likes". */
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
