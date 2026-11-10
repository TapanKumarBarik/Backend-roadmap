// What the drills remember in this browser, and what they say when shared: a streak of days with the puzzle done, the best streak, and the score of
// each day. Pure: the state comes in and goes out, and the page does the reading and writing (lib/storage.js). A "day" is the UTC date text
// the puzzle itself is made from (questions.js dailySeed), so everyone's puzzle and everyone's streak turn over at the same moment.

const DAY = 86400000;
const dayNumber = (day) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY);

/** The state with nothing in it. */
export const emptyState = () => ({ streak: 0, best: 0, last: null, scores: {} });

/** A state read back from storage (any value at all), made safe to use. */
export function readState(value) {
  const state = emptyState();
  if (!value || typeof value !== 'object') return state;
  if (Number.isInteger(value.streak) && value.streak >= 0) state.streak = value.streak;
  if (Number.isInteger(value.best) && value.best >= 0) state.best = value.best;
  if (typeof value.last === 'string' && Number.isFinite(dayNumber(value.last))) state.last = value.last;
  if (value.scores && typeof value.scores === 'object') {
    // Only the last 60 days are kept, so what is stored does not grow for ever.
    for (const [day, score] of Object.entries(value.scores).slice(-60)) {
      if (Number.isFinite(dayNumber(day)) && Number.isInteger(score) && score >= 0 && score <= 100) state.scores[day] = score;
    }
  }
  return state;
}

/**
 * The state after finishing the puzzle of `day` with `score`. The streak goes up when the last day done was yesterday, stays when it is today
 * again (a second go the same day changes nothing but a better score), and starts again at 1 after a gap.
 */
export function recordDay(state, day, score) {
  const next = { ...state, scores: { ...state.scores } };
  if (state.last === day) {
    next.scores[day] = Math.max(state.scores[day] ?? 0, score);
    return next;
  }
  const yesterday = state.last !== null && dayNumber(day) - dayNumber(state.last) === 1;
  next.streak = yesterday ? state.streak + 1 : 1;
  next.best = Math.max(state.best, next.streak);
  next.last = day;
  next.scores[day] = score;
  return next;
}

/** The streak as it stands on `today`: a streak whose last day was before yesterday has already ended, even though nothing has been written. */
export function liveStreak(state, today) {
  if (state.last === null) return 0;
  const gap = dayNumber(today) - dayNumber(state.last);
  return gap <= 1 && gap >= 0 ? state.streak : 0;
}

/** The text to paste: the day, the score, the streak, and where to play. */
export function shareText({ day, score, total, streak, url }) {
  return `Subnet puzzle ${day.replace(/^daily-/, '')}: ${score}/${total}${streak > 1 ? ` · ${streak} days in a row` : ''}\n${url}`;
}
