// Days, streaks and the week at a glance. A "day" is a local calendar date written YYYY-MM-DD (the reader's own today, as in progressStats.js), and what
// counts as studying on a day is any mark made on it: a module started or finished, a problem or a drill done. Pure, so the rules are tested.
import { dayKey } from '../curriculum/progressStats.js';

const parts = (key) => key.split('-').map(Number);

/** The day `n` days from `key` (negative for before), by the calendar, so a clock change never loses or doubles a day. */
export function addDays(key, n) {
  const [y, m, d] = parts(key);
  return dayKey(new Date(y, m - 1, d + n));
}

/** 0 (Sunday) to 6 (Saturday). */
export function weekdayOf(key) {
  const [y, m, d] = parts(key);
  return new Date(y, m - 1, d).getDay();
}

/** The days on which something was started or finished: `timeMap` holds when each module was last marked. */
export function activeDays(statusMap, timeMap) {
  const days = new Set();
  for (const [path, iso] of Object.entries(timeMap)) {
    const status = statusMap[path];
    if (status !== 'done' && status !== 'wip') continue;
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) days.add(dayKey(t));
  }
  return days;
}

/**
 * The days with the site-wide streak counted in. The account keeps a streak of days the reader showed up; its last `streakDays` days (ending today)
 * are days they were here, whether or not a mark was made, so they are active days too and the week strip agrees with the number.
 */
export function withStreakWindow(days, streakDays, today) {
  const next = new Set(days);
  for (let i = 0; i < streakDays; i += 1) next.add(addDays(today, -i));
  return next;
}

/** Days in a row up to today. A streak whose last day was yesterday is still alive (today is not over); one that missed yesterday has ended. */
export function currentStreak(days, today) {
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** The longest run of consecutive days there has been. */
export function longestStreak(days) {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let previous = null;
  for (const key of sorted) {
    run = previous !== null && addDays(previous, 1) === key ? run + 1 : 1;
    best = Math.max(best, run);
    previous = key;
  }
  return best;
}

/** The seven days of the week `today` is in, from `weekStartsOn` (0 Sunday, 1 Monday): { key, active, today, future }. */
export function weekOf(days, today, weekStartsOn) {
  const back = (weekdayOf(today) - weekStartsOn + 7) % 7;
  const start = addDays(today, -back);
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDays(start, i);
    return { key, active: days.has(key), today: key === today, future: key > today };
  });
}

/** How many things were finished on `day`: modules done, problems solved, drills finished. */
export function doneOn(statusMap, timeMap, day) {
  let n = 0;
  for (const [path, iso] of Object.entries(timeMap)) {
    if (statusMap[path] !== 'done') continue;
    const t = Date.parse(iso);
    if (!Number.isNaN(t) && dayKey(t) === day) n += 1;
  }
  return n;
}
