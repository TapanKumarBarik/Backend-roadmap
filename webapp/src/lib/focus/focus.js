// The arithmetic of focus mode (config/focus.js has the words and the length of a session). Pure: the time and the scroll position come in.

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** How far down a scroller is, 0 to 1 (a page that does not scroll is at 0). */
export function scrollRatio({ scrollTop, scrollHeight, clientHeight }) {
  const max = scrollHeight - clientHeight;
  return max > 0 ? clamp01(scrollTop / max) : 0;
}

/** Whole minutes left of a lesson of `totalMinutes` when `ratio` of it has been read: rounded up, so "1" is the last stretch, and 0 only at the end. */
export function minutesLeft(totalMinutes, ratio) {
  if (!(totalMinutes > 0)) return 0;
  return ratio >= 0.999 ? 0 : Math.max(1, Math.ceil(totalMinutes * (1 - clamp01(ratio))));
}

/** A session that began at `startedAt` (ms) and lasts `minutes`: how many ms are left at `now`, and whether it is over. An unusable start is not a session. */
export function sessionLeft(startedAt, now, minutes) {
  if (!Number.isFinite(startedAt) || startedAt <= 0) return null;
  const left = Math.max(0, startedAt + minutes * 60000 - now);
  return { left, over: left === 0 };
}

/** "24:07" for 1,447,000 ms: minutes and seconds, the seconds rounded up so the clock does not say 0:00 while there is still a moment left. */
export function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
