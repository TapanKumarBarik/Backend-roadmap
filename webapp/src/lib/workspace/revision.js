// When a lesson on a revision list is due again, and which to revise first. Pure functions over items as the API returns them
// ({ id, path, title, addedAt, lastRevisedAt, revisedCount }).
//
// A lesson is due a number of days after it was last revised (or, if it never was, after it was added), and the gap grows each time it is
// revised: REVISION.intervalsDays in config/workspace.js. Days are the reader's own calendar days, so "revised today" is today wherever
// they are.
import { REVISION } from '../../config/workspace.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const STATE = Object.freeze({ overdue: 'overdue', today: 'today', later: 'later' });

/** The calendar day of a date or a timestamp, as a whole number that counts days (local time). */
export function dayNumber(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

/** The day a lesson is next due, as a day number. */
export function dueDay(item, intervals = REVISION.intervalsDays) {
  const gap = intervals[Math.min(item.revisedCount || 0, intervals.length - 1)];
  return dayNumber(item.lastRevisedAt || item.addedAt) + gap;
}

/** How many days past its due day a lesson is (0 on the day it is due, negative before). */
export const daysLate = (item, now, intervals) => dayNumber(now) - dueDay(item, intervals);

export function stateOf(item, now, intervals) {
  const late = daysLate(item, now, intervals);
  return late > 0 ? STATE.overdue : late === 0 ? STATE.today : STATE.later;
}

/** Revised on the same calendar day as `now`. */
export const revisedToday = (item, now) => !!item.lastRevisedAt && dayNumber(item.lastRevisedAt) === dayNumber(now);

/** Most overdue first, then those due today, then those not yet due, the soonest first. Equal days: the one waiting longest, then by title. */
export function sortByOverdue(items, now, intervals) {
  return items
    .map((item) => ({ item, late: daysLate(item, now, intervals) }))
    .sort((a, b) => (b.late - a.late) || a.item.addedAt.localeCompare(b.item.addedAt) || a.item.title.localeCompare(b.item.title))
    .map((entry) => entry.item);
}

/** The lesson as it is once "Revised today" has been pressed (the server counts one revision a day, and so does this). */
export function markRevised(item, now) {
  if (revisedToday(item, now)) return item;
  return { ...item, lastRevisedAt: now.toISOString(), revisedCount: (item.revisedCount || 0) + 1 };
}

/** How many lessons are overdue or due today. */
export const dueCount = (items, now, intervals) => items.filter((item) => stateOf(item, now, intervals) !== STATE.later).length;
